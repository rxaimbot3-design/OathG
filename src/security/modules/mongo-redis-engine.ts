import crypto from "crypto";
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

// Distributed lock for cross-process coordination
interface LockEntry {
  owner: string;
  expiresAt: number;
}

// Upstash REST API response types
interface UpstashResponse<T> {
  result: T;
}

export class MongoRedisEngine {
  private static instance: MongoRedisEngine;
  private realCacheMap!: TtlMap<string, { val: any; exp?: number }>;
  private redisClient: any = null;
  private redisAvailable = false;
  private redisInitPromise: Promise<void> | null = null;
  private connectionFailures = 0;
  private circuitBreakerOpen = false;
  private circuitBreakerThreshold = 5;
  private circuitBreakerResetMs = 30000;
  private lastCircuitOpenTime = 0;
  private mongoConnected = false;
  // Process ID for distributed lock identification
  private readonly processId = `${process.pid}-${Date.now()}-${crypto.randomUUID().split("-")[0]}`;
  // Local locks map for cross-process coordination (in-memory fallback)
  private localLocks = new TtlMap<string, LockEntry>({ ttlMs: 10000, maxEntries: 1000, autoCleanupMs: 5000 });
  // Upstash REST API config
  private upstashUrl: string | null = null;
  private upstashToken: string | null = null;
  private useUpstash = false;

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

  // Distributed lock for cross-process coordination
  async acquireLock(key: string, ttlMs = 5000): Promise<boolean> {
    const lockKey = `lock:${key}`;
    
    if (this.redisAvailable) {
      try {
        if (this.useUpstash) {
          // Use Upstash SET NX EX for distributed lock
          const result = await this.upstashRequest<string>("SET", lockKey, this.processId, "NX", "EX", String(Math.ceil(ttlMs / 1000)));
          return result === 'OK';
        } else if (this.redisClient) {
          // Use Redis SET NX for distributed lock
          const result = await this.redisClient.set(lockKey, this.processId, {
            NX: true,
            EX: Math.ceil(ttlMs / 1000)
          });
          return result === 'OK';
        }
      } catch (err) {
        // Redis is available but lock acquisition failed - fail-closed
        // Do NOT fall back to local lock in distributed mode as it breaks
        // the distributed locking guarantee across processes
        console.error(`[MongoRedisEngine] Distributed lock acquisition failed for ${key}:`, (err as Error).message);
        return false;
      }
    }
    
    // Local in-memory lock fallback - ONLY when Redis is NOT available (single-process mode)
    const existing = this.localLocks.get(lockKey);
    const now = Date.now();
    if (existing && existing.expiresAt > now) {
      return false; // Lock held by another process
    }
    this.localLocks.set(lockKey, { owner: this.processId, expiresAt: now + ttlMs });
    return true;
  }

  async releaseLock(key: string): Promise<void> {
    const lockKey = `lock:${key}`;
    
    if (this.redisAvailable) {
      try {
        // Use Lua script for atomic compare-and-delete (works on both Upstash and standard Redis)
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        if (this.useUpstash) {
          await this.upstashRequest("EVAL", script, "1", lockKey, this.processId);
        } else if (this.redisClient) {
          await this.redisClient.eval(script, { keys: [lockKey], arguments: [this.processId] });
        }
        return;
      } catch {
        // Fall back to local release
      }
    }
    
    // Local in-memory release
    const existing = this.localLocks.get(lockKey);
    if (existing && existing.owner === this.processId) {
      this.localLocks.delete(lockKey);
    }
  }

  // Execute operation with distributed lock
  async withLock<T>(key: string, operation: () => Promise<T>, ttlMs = 5000): Promise<T> {
    const acquired = await this.acquireLock(key, ttlMs);
    if (!acquired) {
      // Wait and retry once
      await new Promise(resolve => setTimeout(resolve, 100));
      const retryAcquired = await this.acquireLock(key, ttlMs);
      if (!retryAcquired) {
        throw new Error(`Could not acquire lock for ${key}`);
      }
    }
    
    try {
      return await operation();
    } finally {
      await this.releaseLock(key);
    }
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
          // Check for Upstash REST API credentials first
          const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
          const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
          
          if (upstashUrl && upstashToken) {
            this.upstashUrl = upstashUrl.replace(/\/$/, ""); // Remove trailing slash
            this.upstashToken = upstashToken;
            this.useUpstash = true;
            console.log("[REDIS] Upstash REST API configured, using HTTP-based Redis.");
            // Test connection
            await this.upstashRequest("PING");
            this.redisAvailable = true;
            this.connectionFailures = 0;
            this.circuitBreakerOpen = false;
            console.log("[REDIS] Connected to Upstash Redis via REST API.");
            return;
          }

          // Fallback to standard Redis TCP connection
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

          this.useUpstash = false;
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
            // Null out client and reset init promise to allow reconnection
            this.redisClient = null;
            this.redisInitPromise = null;
            this.recordFailure();
          });

          await this.redisClient.connect();
        }, 3, 1000);
      } catch (err: any) {
        console.warn("[REDIS] Init failed after retries:", err.message);
        this.redisClient = null;
        this.redisInitPromise = null; // Allow retry on next initRedis() call
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

  private ensureCacheMap(): void {
    if (!this.realCacheMap) {
      this.realCacheMap = new TtlMap<string, { val: any; exp?: number }>({
        ttlMs: 24 * 60 * 60 * 1000,
        maxEntries: 100000,
        autoCleanupMs: 60000,
      });
    }
  }

  // Upstash REST API request helper
  private async upstashRequest<T>(command: string, ...args: string[]): Promise<T> {
    if (!this.useUpstash || !this.upstashUrl || !this.upstashToken) {
      throw new Error("Upstash not configured");
    }
    
    const body = [command, ...args];
    const response = await fetch(this.upstashUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.upstashToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      // Check for permission errors and treat them as connection failures
      if (response.status === 403 || errorText.includes("NOPERM")) {
        throw new Error(`Upstash permission denied: ${errorText}`);
      }
      throw new Error(`Upstash request failed: ${response.status} ${errorText}`);
    }
    
    const data = await response.json() as UpstashResponse<T>;
    return data.result;
  }

  get isRedisConnected(): boolean {
    return this.useUpstash ? this.redisAvailable : (this.redisAvailable && !!this.redisClient);
  }

  get isMongoConnected(): boolean {
    return this.mongoConnected;
  }

  async set(key: string, val: any, ttlSec?: number): Promise<void> {
    this.ensureCacheMap();
    if (this.circuitBreakerOpen) {
      this.realCacheMap.set(key, { val });
      return;
    }

    // Use distributed lock for write operations to ensure consistency
    await this.withLock(`set:${key}`, async () => {
      if (this.redisAvailable) {
        try {
          await this.retryWithBackoff(async () => {
            if (this.useUpstash) {
              const serialized = JSON.stringify(val);
              if (ttlSec) {
                await this.upstashRequest("SET", key, serialized, "EX", String(ttlSec));
              } else {
                await this.upstashRequest("SET", key, serialized);
              }
            } else if (this.redisClient) {
              if (ttlSec) {
                await this.redisClient.setEx(key, ttlSec, JSON.stringify(val));
              } else {
                await this.redisClient.set(key, JSON.stringify(val));
              }
            }
          }, 3, 1000);
          return;
        } catch {
          this.redisAvailable = false;
          this.recordFailure();
        }
      }
      // Fallback to in-memory
      this.realCacheMap.set(key, { val });
    });
  }

  async get(key: string): Promise<any> {
    this.ensureCacheMap();
    if (this.circuitBreakerOpen) {
      const entry = this.realCacheMap.get(key);
      if (!entry) return null;
      return entry.val;
    }

    if (this.redisAvailable) {
      try {
        const raw = await this.retryWithBackoff(async () => {
          if (this.useUpstash) {
            return await this.upstashRequest<string | null>("GET", key);
          } else if (this.redisClient) {
            return await this.redisClient.get(key);
          }
          return null;
        }, 3, 1000);
        if (raw) return JSON.parse(raw);
      } catch {
        this.redisAvailable = false;
        this.redisInitPromise = null; // Allow retry on next initRedis() call
        this.recordFailure();
      }
    }
    const entry = this.realCacheMap.get(key);
    if (!entry) return null;
    return entry.val;
  }

  async del(key: string): Promise<void> {
    this.ensureCacheMap();
    if (this.circuitBreakerOpen) {
      this.realCacheMap.delete(key);
      return;
    }

// Use distributed lock for delete operations to ensure consistency
      await this.withLock(`del:${key}`, async () => {
        if (this.redisAvailable) {
          try {
            await this.retryWithBackoff(async () => {
              if (this.useUpstash) {
                await this.upstashRequest("DEL", key);
              } else if (this.redisClient) {
                await this.redisClient.del(key);
              }
            }, 3, 1000);
            return;
          } catch {
            this.redisAvailable = false;
            this.redisInitPromise = null; // Allow retry on next initRedis() call
            this.recordFailure();
          }
        }
        this.realCacheMap.delete(key);
      });
  }

  async performCacheBackup(): Promise<BackupResult> {
    const timestamp = new Date().toISOString();
    const backupDir = path.join(process.cwd(), "backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const dumpFile = path.join(backupDir, `mongo_dump_${Date.now()}.json`);
    
    // Collect actual cache data - prioritize Redis when connected since local cache may be stale
    const cacheData: Record<string, { val: any; exp?: number }> = {};
    
    if (this.isRedisConnected) {
      try {
        if (this.useUpstash) {
          // Upstash REST API - use SCAN to fetch all keys
          await this.backupFromUpstash(cacheData);
        } else if (this.redisClient) {
          // Standard Redis TCP - use SCAN + pipeline
          await this.backupFromRedis(cacheData);
        }
        
        console.log(`[CACHE BACKUP] Fetched ${Object.keys(cacheData).length} application keys from ${this.useUpstash ? "Upstash" : "Redis"}`);
      } catch (err) {
        console.warn("[CACHE BACKUP] Failed to fetch from Redis/Upstash, falling back to local cache:", (err as Error).message);
        // Fall back to local cache
        for (const [key, entry] of this.realCacheMap.entries()) {
          cacheData[key] = entry;
        }
      }
    } else {
      // Use local cache when Redis not connected
      for (const [key, entry] of this.realCacheMap.entries()) {
        cacheData[key] = entry;
      }
    }

    const dumpData = {
      timestamp,
      environment: process.env.NODE_ENV || "development",
      redisConnected: this.isRedisConnected,
      mongoConfigured: this.isMongoConnected,
      cachedKeysCount: Object.keys(cacheData).length,
      cacheData // Actual key/value data
    };

    await this.retryWithBackoff(async () => {
      fs.writeFileSync(dumpFile, JSON.stringify(dumpData, null, 2));
      return Promise.resolve();
    }, 3, 1000);

    const sizeMB = parseFloat((fs.statSync(dumpFile).size / (1024 * 1024)).toFixed(3));
    console.log(`[CACHE BACKUP] Exported cache snapshot to ${dumpFile} (${sizeMB} MB, ${Object.keys(cacheData).length} keys)`);
    return { success: true, timestamp, backupSizeMB: Math.max(0.01, sizeMB), dumpFile };
  }

  private async backupFromRedis(cacheData: Record<string, { val: any; exp?: number }>): Promise<void> {
    let cursor = 0;
    do {
      const result = await this.redisClient!.scan(cursor, { MATCH: "*", COUNT: 1000 });
      cursor = result.cursor;
      
      if (result.keys.length > 0) {
        // Filter out internal keys (session, ratelimit, lock)
        const appKeys = result.keys.filter((key: string) => 
          !key.startsWith("session:admin:") &&
          !key.startsWith("ratelimit:") &&
          !key.startsWith("lock:")
        );
        
        if (appKeys.length > 0) {
          // Use pipeline for efficient batch get
          const pipeline = this.redisClient!.multi();
          for (const key of appKeys) {
            pipeline.get(key);
            pipeline.ttl(key);
          }
          const results = await pipeline.exec();
          
          for (let i = 0; i < appKeys.length; i++) {
            const key = appKeys[i];
            const valueResult = results[i * 2];
            const ttlResult = results[i * 2 + 1];
            
            if (valueResult && valueResult[1]) {
              const ttl = ttlResult[1] as number;
              cacheData[key] = {
                val: JSON.parse(valueResult[1] as string),
                exp: ttl > 0 ? Date.now() + ttl * 1000 : undefined
              };
            }
          }
        }
      }
    } while (cursor !== 0);
  }

  private async backupFromUpstash(cacheData: Record<string, { val: any; exp?: number }>): Promise<void> {
    // Upstash REST API supports SCAN - iterate all keys
    let cursor = "0";
    do {
      const result = await this.upstashRequest<[string, string[]]>("SCAN", cursor, "MATCH", "*", "COUNT", "1000");
      cursor = result[0];
      
      if (result[1].length > 0) {
        // Filter out internal keys
        const appKeys = result[1].filter(key => 
          !key.startsWith("session:admin:") &&
          !key.startsWith("ratelimit:") &&
          !key.startsWith("lock:")
        );
        
        if (appKeys.length > 0) {
          // Fetch values and TTLs for each key (Upstash doesn't support pipeline, so batch in chunks)
          for (const key of appKeys) {
            try {
              const value = await this.upstashRequest<string | null>("GET", key);
              const ttl = await this.upstashRequest<number>("TTL", key);
              
              if (value) {
                cacheData[key] = {
                  val: JSON.parse(value),
                  exp: ttl > 0 ? Date.now() + ttl * 1000 : undefined
                };
              }
            } catch {
              // Ignore individual key failures
            }
          }
        }
      }
    } while (cursor !== "0");
  }

  async restoreCacheBackup(dumpFile: string): Promise<{ success: boolean; restoredKeys: number; error?: string }> {
    try {
      if (!fs.existsSync(dumpFile)) {
        return { success: false, restoredKeys: 0, error: "Backup file not found" };
      }

      const dumpData = JSON.parse(fs.readFileSync(dumpFile, "utf8"));
      
      if (!dumpData.cacheData || typeof dumpData.cacheData !== "object") {
        return { success: false, restoredKeys: 0, error: "Invalid backup format: no cache data" };
      }

      const cacheData = dumpData.cacheData as Record<string, { val: any; exp?: number }>;
      const backupKeys = new Set(Object.keys(cacheData));
      
      // Ensure cache map exists
      this.ensureCacheMap();
      
      // Clear existing cache
      this.realCacheMap.clear();
      
      // Restore cache data
      let restoredKeys = 0;
      for (const [key, entry] of Object.entries(cacheData)) {
        // Preserve original expiration timestamp if present
        if (entry.exp && entry.exp > Date.now()) {
          this.realCacheMap.setWithExpiry(key, entry.val, entry.exp);
        } else {
          this.realCacheMap.set(key, entry.val);
        }
        restoredKeys++;
      }

      // Also restore to Redis if connected
      if (this.isRedisConnected) {
        const client = this.redisClient;
        
        // First, delete keys not in backup (for exact restore)
        if (!this.useUpstash && client) {
          try {
            let cursor = 0;
            const keysToDelete: string[] = [];
            do {
              const result = await client.scan(cursor, { MATCH: "*", COUNT: 1000 });
              cursor = result.cursor;
              
              for (const key of result.keys) {
                // Only delete application keys not in backup (skip internal keys)
                if (!key.startsWith("session:admin:") &&
                    !key.startsWith("ratelimit:") &&
                    !key.startsWith("lock:") &&
                    !backupKeys.has(key)) {
                  keysToDelete.push(key);
                }
              }
            } while (cursor !== 0);
            
            if (keysToDelete.length > 0) {
              await client.del(keysToDelete);
              console.log(`[CACHE RESTORE] Deleted ${keysToDelete.length} keys not in backup`);
            }
          } catch (err) {
            console.warn("[CACHE RESTORE] Failed to delete old keys:", (err as Error).message);
          }
        } else if (this.useUpstash) {
          // Upstash REST API - use SCAN to find and delete keys not in backup
          try {
            let cursor = "0";
            const keysToDelete: string[] = [];
            do {
              const result = await this.upstashRequest<[string, string[]]>("SCAN", cursor, "MATCH", "*", "COUNT", "1000");
              cursor = result[0];
              
              for (const key of result[1]) {
                // Only delete application keys not in backup (skip internal keys)
                if (!key.startsWith("session:admin:") &&
                    !key.startsWith("ratelimit:") &&
                    !key.startsWith("lock:") &&
                    !backupKeys.has(key)) {
                  keysToDelete.push(key);
                }
              }
            } while (cursor !== "0");
            
            if (keysToDelete.length > 0) {
              // Delete in chunks (Upstash DEL supports multiple keys)
              for (let i = 0; i < keysToDelete.length; i += 100) {
                const chunk = keysToDelete.slice(i, i + 100);
                await this.upstashRequest("DEL", ...chunk);
              }
              console.log(`[CACHE RESTORE] Deleted ${keysToDelete.length} keys not in backup (Upstash)`);
            }
          } catch (err) {
            console.warn("[CACHE RESTORE] Failed to delete old keys (Upstash):", (err as Error).message);
          }
        }
        
        if (client && !this.useUpstash) {
          for (const [key, entry] of Object.entries(cacheData)) {
            try {
              if (entry.exp) {
                const ttlSec = Math.max(1, Math.ceil((entry.exp - Date.now()) / 1000));
                if (ttlSec > 0) {
                  await client.setEx(key, ttlSec, JSON.stringify(entry.val));
                }
              } else {
                await client.set(key, JSON.stringify(entry.val));
              }
            } catch {
              // Ignore individual key failures
            }
          }
        } else if (this.useUpstash && this.upstashUrl && this.upstashToken) {
          // Upstash restore would need individual SET calls
          // Note: Upstash doesn't support SCAN for deletion, so we skip deletion for Upstash
          for (const [key, entry] of Object.entries(cacheData)) {
            try {
              const serialized = JSON.stringify(entry.val);
              if (entry.exp) {
                const ttlSec = Math.max(1, Math.ceil((entry.exp - Date.now()) / 1000));
                if (ttlSec > 0) {
                  await this.upstashRequest("SET", key, serialized, "EX", String(ttlSec));
                }
              } else {
                await this.upstashRequest("SET", key, serialized);
              }
            } catch {
              // Ignore individual key failures
            }
          }
        }
      }

      console.log(`[CACHE RESTORE] Restored ${restoredKeys} keys from ${dumpFile}`);
      return { success: true, restoredKeys };
    } catch (err: any) {
      console.error("[CACHE RESTORE] Failed:", err.message);
      return { success: false, restoredKeys: 0, error: err.message };
    }
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

  static async restoreCacheBackup(dumpFile: string): Promise<{ success: boolean; restoredKeys: number; error?: string }> {
    return this.getInstance().restoreCacheBackup(dumpFile);
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