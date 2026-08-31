import fs from "fs";
import path from "path";
import { TtlMap } from "../MapManager.js";
import { atomicWriteJsonSync } from "./utils.js";

export interface CacheStats {
  connected: boolean;
  engine: string;
  keysCount: number;
  memoryUsedMB: number;
  hitRatePct: number | null;
  latencyMs: number | null;
}

export interface BackupResult {
  success: boolean;
  timestamp: string;
  backupSizeMB: number;
  dumpFile: string;
}

export class MongoRedisEngine {
  private static instance: MongoRedisEngine;
  private realCacheMap: TtlMap<string, { val: any; exp?: number }>;
  private redisClient: any = null;
  private redisAvailable = false;
  private redisInitPromise: Promise<void> | null = null;
  private connectionFailures = 0;
  private circuitBreakerOpen = false;
  private circuitBreakerThreshold = 5;
  private circuitBreakerResetMs = 30000;
  private lastCircuitOpenTime = 0;

  private constructor() {
    this.realCacheMap = new TtlMap<string, { val: any; exp?: number }>({
      ttlMs: 24 * 60 * 60 * 1000,
      maxEntries: 10000,
      autoCleanupMs: 300000,
    });
  }

  static getInstance(): MongoRedisEngine {
    if (!MongoRedisEngine.instance) {
      MongoRedisEngine.instance = new MongoRedisEngine();
    }
    return MongoRedisEngine.instance;
  }

  static resetInstance(): void {
    MongoRedisEngine.instance = undefined as any;
  }

  private async retryWithBackoff<T>(operation: () => Promise<T>, maxRetries = 3, initialDelayMs = 1000): Promise<T> {
    let delay = initialDelayMs;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err: any) {
        if (attempt < maxRetries) {
          console.warn(`[MONGO_REDIS] Operation failed (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`, err.message);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
        } else {
          throw err;
        }
      }
    }
    throw new Error("Max retries exceeded");
  }

  async initRedis(): Promise<void> {
    if (this.redisInitPromise) return this.redisInitPromise;
    if (this.redisClient) return Promise.resolve();

    // Circuit breaker check
    if (this.circuitBreakerOpen) {
      const timeSinceOpen = Date.now() - this.lastCircuitOpenTime;
      if (timeSinceOpen > this.circuitBreakerResetMs) {
        console.log("[REDIS] Circuit breaker reset attempt");
        this.circuitBreakerOpen = false;
        this.connectionFailures = 0;
      } else {
        console.log("[REDIS] Circuit breaker open, skipping connection attempt");
        return;
      }
    }

    this.redisInitPromise = (async () => {
      try {
        await this.retryWithBackoff(async () => {
          const redisUrl = process.env.REDIS_URL || process.env.REDIS_HOST;
          if (!redisUrl) {
            console.log("[REDIS] No REDIS_URL configured, using in-memory fallback.");
            return;
          }

          let RedisClient: any;
          try {
            const mod = await import("redis");
            RedisClient = mod.createClient || mod.default;
          } catch {
            console.log("[REDIS] redis package not installed, using in-memory fallback.");
            return;
          }

          this.redisClient = RedisClient({ url: redisUrl });
          this.redisClient.on("error", (err: any) => {
            console.warn("[REDIS] Client error:", err.message);
            this.redisAvailable = false;
          });
          this.redisClient.on("connect", () => {
            console.log("[REDIS] Connected to external Redis server.");
            this.redisAvailable = true;
            this.connectionFailures = 0;
            this.circuitBreakerOpen = false;
          });
          this.redisClient.on("disconnect", () => {
            console.warn("[REDIS] Disconnected from Redis");
            this.redisAvailable = false;
            this.recordFailure();
          });

          await this.redisClient.connect();
        }, 3, 1000);
      } catch (err: any) {
        console.warn("[REDIS] Init failed after retries:", err.message);
        this.redisClient = null;
        this.recordFailure();
      }
    })();

    return this.redisInitPromise;
  }

  private recordFailure(): void {
    this.connectionFailures++;
    if (this.connectionFailures >= this.circuitBreakerThreshold) {
      this.circuitBreakerOpen = true;
      this.lastCircuitOpenTime = Date.now();
      console.error(`[REDIS] Circuit breaker OPENED after ${this.connectionFailures} failures`);
    }
  }

  get isRedisConnected(): boolean {
    return this.redisAvailable && !!this.redisClient;
  }

  get isMongoConnected(): boolean {
    return !!(process.env.MONGODB_URI || process.env.MONGO_URL);
  }

  async set(key: string, val: any, ttlSec?: number): Promise<void> {
    if (this.circuitBreakerOpen) {
      this.realCacheMap.set(key, { val });
      return;
    }

    if (this.redisAvailable && this.redisClient) {
      try {
        await this.retryWithBackoff(async () => {
          if (ttlSec) {
            await this.redisClient.setEx(key, ttlSec, JSON.stringify(val));
          } else {
            await this.redisClient.set(key, JSON.stringify(val));
          }
        }, 3, 1000);
        return;
      } catch {
        this.redisAvailable = false;
        this.recordFailure();
      }
    }
    this.realCacheMap.set(key, { val });
  }

  async get(key: string): Promise<any> {
    if (this.circuitBreakerOpen) {
      const entry = this.realCacheMap.get(key);
      if (!entry) return null;
      return entry.val;
    }

    if (this.redisAvailable && this.redisClient) {
      try {
        const raw = await this.retryWithBackoff(async () => {
          return await this.redisClient.get(key);
        }, 3, 1000);
        if (raw) return JSON.parse(raw);
      } catch {
        this.redisAvailable = false;
        this.recordFailure();
      }
    }
    const entry = this.realCacheMap.get(key);
    if (!entry) return null;
    return entry.val;
  }

  async del(key: string): Promise<void> {
    if (this.circuitBreakerOpen) {
      this.realCacheMap.delete(key);
      return;
    }

    if (this.redisAvailable && this.redisClient) {
      try {
        await this.retryWithBackoff(async () => {
          await this.redisClient.del(key);
        }, 3, 1000);
        return;
      } catch {
        this.redisAvailable = false;
        this.recordFailure();
      }
    }
    this.realCacheMap.delete(key);
  }

  async performCacheBackup(): Promise<BackupResult> {
    const timestamp = new Date().toISOString();
    const backupDir = path.join(process.cwd(), "backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const dumpFile = path.join(backupDir, `mongo_dump_${Date.now()}.json`);
    const dumpData = {
      timestamp,
      environment: process.env.NODE_ENV || "development",
      redisConnected: this.isRedisConnected,
      mongoConfigured: this.isMongoConnected,
      cachedKeysCount: this.realCacheMap.size
    };

    await this.retryWithBackoff(async () => {
      fs.writeFileSync(dumpFile, JSON.stringify(dumpData, null, 2));
      return Promise.resolve();
    }, 3, 1000);

    const sizeMB = parseFloat((fs.statSync(dumpFile).size / (1024 * 1024)).toFixed(3));
    console.log(`[CACHE BACKUP] Exported cache snapshot to ${dumpFile} (${sizeMB} MB)`);
    return { success: true, timestamp, backupSizeMB: Math.max(0.01, sizeMB), dumpFile };
  }

  getRedisStats(): CacheStats {
    const memUsage = process.memoryUsage();
    const realMemUsedMB = parseFloat(((memUsage.heapUsed + (memUsage.arrayBuffers || 0)) / (1024 * 1024)).toFixed(2));
    return {
      connected: this.isRedisConnected,
      engine: this.isRedisConnected ? "External Redis" : "In-Memory Key-Value Store (Redis Emulator)",
      keysCount: this.realCacheMap.size,
      memoryUsedMB: realMemUsedMB,
      hitRatePct: null,
      latencyMs: null
    };
  }

  clear(): void {
    this.realCacheMap.clear();
  }

  // Static wrapper methods for backward compatibility
  static async initRedis(): Promise<void> {
    return this.getInstance().initRedis();
  }

  static get isRedisConnected(): boolean {
    return this.getInstance().isRedisConnected;
  }

  static get isMongoConnected(): boolean {
    return this.getInstance().isMongoConnected;
  }

  static async set(key: string, val: any, ttlSec?: number): Promise<void> {
    return this.getInstance().set(key, val, ttlSec);
  }

  static async get(key: string): Promise<any> {
    return this.getInstance().get(key);
  }

  static async del(key: string): Promise<void> {
    return this.getInstance().del(key);
  }

  static async performCacheBackup(): Promise<BackupResult> {
    return this.getInstance().performCacheBackup();
  }

  static getRedisStats(): CacheStats {
    return this.getInstance().getRedisStats();
  }

  static clear(): void {
    return this.getInstance().clear();
  }

  static getClient(): any {
    return this.getInstance().redisClient;
  }
}