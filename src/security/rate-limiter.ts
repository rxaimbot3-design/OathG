/**
 * RateLimiter - Redis-backed or in-memory rate limiting.
 * Instance-based implementation for use with GuildContext.
 */

import type { SecurityModule } from "../core/interfaces/SecurityModule";

export class RateLimiterInstance implements SecurityModule {
  readonly name = "rateLimiter";
  private requests = new Map<string, number[]>();
  private redisAvailable = false;

  init(): void {
    // Redis availability is set externally
  }

  setRedisAvailable(available: boolean): void {
    this.redisAvailable = available;
  }

  checkLimit(key: string, windowMs: number, maxRequests: number): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];
    const validTimestamps = timestamps.filter(t => now - t < windowMs);
    
    if (validTimestamps.length >= maxRequests) {
      return false; // Limit exceeded
    }

    validTimestamps.push(now);
    this.requests.set(key, validTimestamps);
    return true; // Within limit
  }

  getRemainingRequests(key: string, windowMs: number, maxRequests: number): number {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];
    const validTimestamps = timestamps.filter(t => now - t < windowMs);
    return Math.max(0, maxRequests - validTimestamps.length);
  }

  reset(key: string): void {
    this.requests.delete(key);
  }

  clear(): void {
    this.requests.clear();
  }
}

/**
 * Global singleton instance (backwards compatibility).
 * @deprecated Use GuildContext.getRateLimiter() instead.
 */
export const RateLimiter = new RateLimiterInstance();
