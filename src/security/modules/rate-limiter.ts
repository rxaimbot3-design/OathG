/**
 * RateLimiter - Distributed rate limiting with Redis persistence
 * 
 * Features:
 * - Sliding window rate limiting
 * - Redis persistence with in-memory fallback
 * - Automatic cleanup of expired entries
 * - Per-user and global limits
 */

import { TtlMap } from "../MapManager.js";
import { RedisPersistence } from "./redis-persistence.js";

export interface RateLimiterConfig {
  windowMs?: number;
  maxRequests?: number;
  redisEnabled?: boolean;
  keyPrefix?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  totalRequests: number;
}

export class RateLimiter {
  private static instance: RateLimiter;
  private userActions: TtlMap<string, { count: number; timestamp: number }>;
  private config: Required<RateLimiterConfig>;
  private persistence: RedisPersistence;
  private initialized = false;

  private constructor(config: RateLimiterConfig = {}) {
    this.config = {
      windowMs: config.windowMs ?? 10000,
      maxRequests: config.maxRequests ?? 5,
      redisEnabled: config.redisEnabled ?? true,
      keyPrefix: config.keyPrefix ?? "ratelimit:",
    };
    this.userActions = new TtlMap<string, { count: number; timestamp: number }>({
      ttlMs: this.config.windowMs * 2,
      maxEntries: 10000,
      autoCleanupMs: 30000,
    });
    this.persistence = RedisPersistence.getInstance();
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

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.config.redisEnabled) {
      await this.persistence.connect();
    }
    this.initialized = true;
  }

  async check(userId: string): Promise<RateLimitResult> {
    if (!this.initialized) await this.initialize();

    const now = Date.now();
    const windowMs = this.config.windowMs;
    const limit = this.config.maxRequests;
    const resetAt = now + windowMs;
    const key = `${this.config.keyPrefix}${userId}`;

    if (this.config.redisEnabled) {
      try {
        // Use Redis for distributed rate limiting
        const count = await this.persistence.incr(key, windowMs);
        const ttlSec = Math.ceil(windowMs / 1000);
        await this.persistence.expire(key, windowMs);

        const remaining = Math.max(0, limit - count);
        return {
          allowed: count <= limit,
          remaining,
          resetAt,
          totalRequests: count,
        };
      } catch (err) {
        console.warn("[RateLimiter] Redis check failed, using in-memory fallback:", (err as Error).message);
      }
    }

    // In-memory fallback (used when redisEnabled is false or Redis fails)
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
      totalRequests: data.count,
    };
  }

  async isBlocked(userId: string): Promise<boolean> {
    const result = await this.check(userId);
    return !result.allowed;
  }

  async getCurrentCount(userId: string): Promise<number> {
    if (!this.initialized) await this.initialize();
    const key = `${this.config.keyPrefix}${userId}`;
    try {
      const value = await this.persistence.get<string>(key);
      return value ? parseInt(value) : 0;
    } catch {
      const data = this.userActions.get(userId);
      return data?.count ?? 0;
    }
  }

  async reset(userId: string): Promise<void> {
    const key = `${this.config.keyPrefix}${userId}`;
    await this.persistence.del(key);
    this.userActions.delete(userId);
  }

  async resetAll(): Promise<void> {
    const keys = await this.persistence.keys(`${this.config.keyPrefix}*`);
    for (const key of keys) {
      await this.persistence.del(key);
    }
    this.userActions.clear();
  }

  getStats() {
    return {
      memoryEntries: this.userActions.size,
      config: this.config,
      redisConnected: this.persistence.getConnectionStatus().connected,
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

  static async getCurrentCount(userId: string): Promise<number> {
    return this.getInstance().getCurrentCount(userId);
  }

  static async reset(userId: string): Promise<void> {
    return this.getInstance().reset(userId);
  }

  static async resetAll(): Promise<void> {
    return this.getInstance().resetAll();
  }
}