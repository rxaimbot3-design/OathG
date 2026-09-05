/**
 * Rate limiting middleware with bounded memory usage.
 */

import type { Request, Response, NextFunction } from "express";

interface RateLimitRecord {
  count: number;
  resetAt: number;
  lastAccessed: number;
}

interface RateLimiterConfig {
  windowMs: number;
  maxRequests: number;
  maxKeys?: number;
  cleanupIntervalMs?: number;
}

class BoundedRateLimiter {
  private store = new Map<string, RateLimitRecord>();
  private readonly maxKeys: number;
  private readonly cleanupIntervalMs: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: RateLimiterConfig) {
    this.maxKeys = config.maxKeys ?? 10000;
    this.cleanupIntervalMs = config.cleanupIntervalMs ?? 60000; // 1 minute default
    this.startCleanupTimer();
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => this.cleanup(), this.cleanupIntervalMs);
    // Don't prevent process exit
    this.cleanupTimer.unref?.();
  }

  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    // Remove expired entries
    for (const [key, record] of this.store.entries()) {
      if (now > record.resetAt) {
        this.store.delete(key);
        removed++;
      }
    }

    // If still over max keys, remove oldest accessed entries (LRU)
    if (this.store.size > this.maxKeys) {
      const entries = Array.from(this.store.entries())
        .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
      
      const toRemove = entries.slice(0, this.store.size - this.maxKeys);
      for (const [key] of toRemove) {
        this.store.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[RateLimiter] Cleaned up ${removed} entries, current size: ${this.store.size}`);
    }
  }

  check(key: string, windowMs: number, maxRequests: number): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const record = this.store.get(key);

    if (!record || now > record.resetAt) {
      // New or expired window
      const newRecord: RateLimitRecord = {
        count: 1,
        resetAt: now + windowMs,
        lastAccessed: now
      };
      
      // Check if we need to evict before adding
      if (this.store.size >= this.maxKeys) {
        this.cleanup();
      }
      
      this.store.set(key, newRecord);
      return { allowed: true, remaining: maxRequests - 1, resetAt: newRecord.resetAt };
    }

    // Update last accessed for LRU
    record.lastAccessed = now;

    if (record.count >= maxRequests) {
      return { allowed: false, remaining: 0, resetAt: record.resetAt };
    }

    record.count++;
    return { allowed: true, remaining: maxRequests - record.count, resetAt: record.resetAt };
  }

  getSize(): number {
    return this.store.size;
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.store.clear();
  }
}

// Default global rate limiter instance
let globalRateLimiter: BoundedRateLimiter | null = null;

function getGlobalRateLimiter(config: RateLimiterConfig): BoundedRateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new BoundedRateLimiter(config);
  }
  return globalRateLimiter;
}

export function rateLimit(windowMs: number, maxRequests: number, options?: { maxKeys?: number; cleanupIntervalMs?: number }) {
  const limiter = getGlobalRateLimiter({ windowMs, maxRequests, ...options });
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || "unknown";
    const result = limiter.check(key, windowMs, maxRequests);

    res.setHeader("X-RateLimit-Limit", maxRequests.toString());
    res.setHeader("X-RateLimit-Remaining", result.remaining.toString());
    res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000).toString());

    if (!result.allowed) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    next();
  };
}

export function getRateLimiterStats(): { size: number } | null {
  if (!globalRateLimiter) return null;
  return { size: globalRateLimiter.getSize() };
}

export function resetRateLimiter(): void {
  if (globalRateLimiter) {
    globalRateLimiter.destroy();
    globalRateLimiter = null;
  }
}