import crypto from "crypto";
import { MongoRedisEngine } from "../security/modules/mongo-redis-engine.js";

export interface RedisRateLimiterConfig {
  /** When true and Redis is unavailable, fail-closed (reject requests) instead of falling back to local mode.
   * Should be enabled in multi-instance deployments to maintain rate-limit consistency. */
  failClosedOnRedisFailure?: boolean;
}

const LOCAL_FALLBACK_MAX_ENTRIES = 10000;
const LOCAL_FALLBACK_CLEANUP_MS = 5 * 60 * 1000;

const RATE_LIMIT_LUA_SCRIPT = `
  local key = KEYS[1]
  local windowStart = tonumber(ARGV[1])
  local now = tonumber(ARGV[2])
  local ttlSec = tonumber(ARGV[3])
  local member = ARGV[4]

  redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
  redis.call('ZADD', key, now, member)
  redis.call('EXPIRE', key, ttlSec)
  local count = redis.call('ZCARD', key)
  return count
`;

export class RedisRateLimiter {
  private static redisAvailable: boolean = false;
  private static localRequests = new Map<string, number[]>();
  private static localCleanupTimer: NodeJS.Timeout | null = null;
  private static config: RedisRateLimiterConfig = { failClosedOnRedisFailure: false };

  static async init(config: RedisRateLimiterConfig = {}): Promise<void> {
    this.config = config;
    try {
      await MongoRedisEngine.initRedis();
      this.redisAvailable = MongoRedisEngine.isRedisConnected;
    } catch {
      this.redisAvailable = false;
    }
    this.startLocalCleanup();
  }

  private static startLocalCleanup(): void {
    if (this.localCleanupTimer) return;
    this.localCleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, timestamps] of this.localRequests.entries()) {
        const valid = timestamps.filter(t => now - t < 24 * 60 * 60 * 1000);
        if (valid.length === 0) {
          this.localRequests.delete(key);
        } else {
          this.localRequests.set(key, valid);
        }
      }
    }, LOCAL_FALLBACK_CLEANUP_MS);
  }

  static async check(key: string, windowMs: number, maxRequests: number): Promise<boolean> {
    if (this.redisAvailable) {
      try {
        const client = await MongoRedisEngine.getClient();
        if (!client) {
          this.redisAvailable = false;
          return this.handleRedisFailure(key, windowMs, maxRequests);
        }

        const now = Date.now();
        const windowStart = now - windowMs;
        const redisKey = `ratelimit:${key}`;
        const ttlSec = Math.ceil(windowMs / 1000);
        const member = `${now}:${crypto.randomUUID()}`;

        const count = await client.eval(RATE_LIMIT_LUA_SCRIPT, 1, redisKey, windowStart, now, ttlSec, member) as number;
        return count < maxRequests;
      } catch {
        this.redisAvailable = false;
        return this.handleRedisFailure(key, windowMs, maxRequests);
      }
    }

    return this.handleRedisFailure(key, windowMs, maxRequests);
  }

  /**
   * Handles Redis failure - either fail-closed or fall back to local mode
   * based on configuration.
   */
  private static handleRedisFailure(key: string, windowMs: number, maxRequests: number): boolean {
    if (this.config.failClosedOnRedisFailure) {
      // Fail-closed: reject requests when Redis is unavailable in distributed mode
      console.warn(`[RedisRateLimiter] Redis unavailable, failing closed for key: ${key}`);
      return false;
    }
    // Fallback to local in-memory rate limiting (single-instance mode)
    return this.checkLocal(key, windowMs, maxRequests);
  }

  private static checkLocal(key: string, windowMs: number, maxRequests: number): boolean {
    const now = Date.now();
    const timestamps = this.localRequests.get(key) || [];

    if (this.localRequests.size > LOCAL_FALLBACK_MAX_ENTRIES) {
      const oldestKey = this.localRequests.keys().next().value;
      if (oldestKey) {
        this.localRequests.delete(oldestKey);
      }
    }

    const validTimestamps = timestamps.filter(t => now - t < windowMs);

    if (validTimestamps.length >= maxRequests) {
      return false;
    }

    validTimestamps.push(now);
    this.localRequests.set(key, validTimestamps);
    return true;
  }

  static isAvailable(): boolean {
    return this.redisAvailable;
  }

  static getConfig(): RedisRateLimiterConfig {
    return { ...this.config };
  }
}
