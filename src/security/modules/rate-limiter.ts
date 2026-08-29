import { TtlMap } from "../MapManager.js";
import { MongoRedisEngine } from "./mongo-redis-engine.js";

export interface RateLimiterConfig {
  windowMs?: number;
  maxRequests?: number;
  redisEnabled?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export class RateLimiter {
  private static instance: RateLimiter;
  private userActions: TtlMap<string, { count: number; timestamp: number }>;
  private redisAvailable = false;
  private redisChecked = false;
  private config: Required<RateLimiterConfig>;

  private constructor(config: RateLimiterConfig = {}) {
    this.config = {
      windowMs: config.windowMs ?? 10000,
      maxRequests: config.maxRequests ?? 5,
      redisEnabled: config.redisEnabled ?? true,
    };
    this.userActions = new TtlMap<string, { count: number; timestamp: number }>({
      ttlMs: this.config.windowMs * 2,
      maxEntries: 10000,
      autoCleanupMs: 30000,
    });
  }

  static getInstance(config?: RateLimiterConfig): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter(config);
    }
    return RateLimiter.instance;
  }

  static resetInstance(): void {
    RateLimiter.instance = undefined as any;
  }

  private async ensureRedis(): Promise<boolean> {
    if (this.redisChecked) return this.redisAvailable;
    if (!this.config.redisEnabled) {
      this.redisAvailable = false;
      this.redisChecked = true;
      return false;
    }
    try {
      await MongoRedisEngine.initRedis();
      this.redisAvailable = MongoRedisEngine.isRedisConnected;
    } catch {
      this.redisAvailable = false;
    }
    this.redisChecked = true;
    return this.redisAvailable;
  }

  async check(userId: string): Promise<RateLimitResult> {
    const redisReady = await this.ensureRedis();
    const now = Date.now();
    const windowMs = this.config.windowMs;
    const limit = this.config.maxRequests;
    const resetAt = now + windowMs;

    if (redisReady) {
      try {
        const client = MongoRedisEngine.getClient();
        if (client) {
          const key = `ratelimit:user:${userId}`;
          const ttlSec = Math.ceil(windowMs / 1000);
          
          const count = await client.incr(key);
          if (count === 1) {
            await client.expire(key, ttlSec);
          }
          
          const remaining = Math.max(0, limit - count);
          return {
            allowed: count <= limit,
            remaining,
            resetAt,
          };
        }
      } catch {
        this.redisAvailable = false;
      }
    }

    // In-memory fallback
    const data = this.userActions.get(userId) || { count: 0, timestamp: now };

    if (now - data.timestamp > windowMs) {
      data.count = 1;
      data.timestamp = now;
    } else {
      data.count++;
    }

    this.userActions.set(userId, data);
    const remaining = Math.max(0, limit - data.count);
    
    return {
      allowed: data.count <= limit,
      remaining,
      resetAt: data.timestamp + windowMs,
    };
  }

  async isBlocked(userId: string): Promise<boolean> {
    const result = await this.check(userId);
    return !result.allowed;
  }

  getStats() {
    return {
      memoryEntries: this.userActions.size,
      redisAvailable: this.redisAvailable,
      config: this.config,
    };
  }

  clear(): void {
    this.userActions.clear();
  }

  // Static wrapper methods for backward compatibility
  static async check(userId: string): Promise<RateLimitResult> {
    return this.getInstance().check(userId);
  }

  static async isBlocked(userId: string): Promise<boolean> {
    return this.getInstance().isBlocked(userId);
  }
}