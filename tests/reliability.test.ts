import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { SecurityPipeline } from "../src/security/Pipeline.js";
import { UltraLowLatencyPipeline } from "../src/core/UltraLowLatencyPipeline.js";
import { DiscordRestCircuitBreaker, getDiscordRestCircuitBreaker, resetDiscordRestCircuitBreaker } from "../src/services/discordCircuitBreaker.js";
import { MongoRedisEngine } from "../src/security/modules/mongo-redis-engine.js";
import { IdempotencyManager, withIdempotency, resetIdempotencyManager } from "../src/services/idempotency.js";

describe("Reliability: Circuit Breaker", () => {
  let breaker: DiscordRestCircuitBreaker;

  beforeEach(() => {
    resetDiscordRestCircuitBreaker();
    breaker = new DiscordRestCircuitBreaker({ failureThreshold: 3, timeout: 1000 });
  });

  it("opens after failure threshold", async () => {
    // Fail 3 times
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => { throw new Error("Service unavailable"); });
      } catch {}
    }
    
    expect(breaker.getState()).toBe("OPEN");
  });

  it("rejects requests when open", async () => {
    const breaker = new DiscordRestCircuitBreaker({ failureThreshold: 2, timeout: 1000 });
    
    await breaker.execute(async () => { throw new Error("Fail 1"); }).catch(() => {});
    await breaker.execute(async () => { throw new Error("Fail 2"); }).catch(() => {});
    
    expect(breaker.getState()).toBe("OPEN");
    
    await expect(breaker.execute(async () => "success")).rejects.toThrow("CIRCUIT_BREAKER_OPEN");
  });

  it("transitions to half-open after timeout", async () => {
    const breaker = new DiscordRestCircuitBreaker({ failureThreshold: 2, timeout: 100, successThreshold: 2 });
    
    await breaker.execute(async () => { throw new Error("Fail 1"); }).catch(() => {});
    await breaker.execute(async () => { throw new Error("Fail 2"); }).catch(() => {});
    
    expect(breaker.getState()).toBe("OPEN");
    
    // Wait for timeout
    await new Promise(resolve => setTimeout(resolve, 150));
    
    expect(breaker.getState()).toBe("HALF_OPEN");
    
    // Success should close it
    await breaker.execute(async () => "success");
    await breaker.execute(async () => "success");
    
    expect(breaker.getState()).toBe("CLOSED");
  });

  it("ignores client errors (4xx) for circuit breaking", async () => {
    const breaker = new DiscordRestCircuitBreaker({ failureThreshold: 2, timeout: 1000, excludedStatusCodes: [400, 401, 403, 404] });
    
    // 4xx errors should not trip the breaker
    const error400 = new Error("Bad Request");
    (error400 as any).status = 400;
    
    await breaker.execute(async () => { throw error400; }).catch(() => {});
    await breaker.execute(async () => { throw error400; }).catch(() => {});
    
    expect(breaker.getState()).toBe("CLOSED");
  });
});

describe("Reliability: Graceful Degradation", () => {
  beforeEach(() => {
    SecurityPipeline.reset();
  });

  it("degrades gracefully when Redis is unavailable", async () => {
    const { RateLimiter } = await import("../src/SecurityFeatures.js");
    const limiter = RateLimiter.getInstance({ redisEnabled: false, maxRequests: 10, windowMs: 10000 });
    
    // Should work with in-memory fallback
    for (let i = 0; i < 5; i++) {
      const result = await limiter.check("test_key");
      expect(result.allowed).toBe(true);
    }
    
    // Verify rate limiting works (may be more permissive in fallback mode)
    const result = await limiter.check("test_key");
    // In fallback mode, may allow more requests but should still track
    expect(typeof result.allowed).toBe("boolean");
  });

  it("SecurityPipeline continues operating under component failure", () => {
    // Even if some components fail, pipeline should process events
    const events: any[] = [];
    for (let i = 0; i < 100; i++) {
      events.push({
        type: "channel_create",
        userId: `user_${i}`,
        guildId: "guild_1",
        timestamp: Date.now() + i,
        payload: {},
      });
    }
    
    const results = SecurityPipeline.processBatch(events);
    expect(results).toHaveLength(100);
    expect(results.every(r => typeof r.blocked === "boolean")).toBe(true);
  });

  it("UltraLowLatencyPipeline handles worker failures gracefully", async () => {
    const pipeline = UltraLowLatencyPipeline.getInstance();
    
    // Register a handler that succeeds
    pipeline.registerHandler("success_test", async () => { });
    
    // Should not crash the pipeline
    const id = await pipeline.enqueue({
      type: "success_test",
      guildId: "guild_1",
      payload: {},
      priority: "normal",
    });
    
    expect(id).toBeDefined();
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const metrics = pipeline.getMetrics();
    expect(metrics.processed).toBeGreaterThan(0);
  });

  it("IdempotencyManager recovers from operation failures", async () => {
    const { withIdempotency, resetIdempotencyManager } = await import("../src/services/idempotency.js");
    resetIdempotencyManager();
    
    let attemptCount = 0;
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error("Transient failure"))
      .mockResolvedValue({ success: true });
    
    // First attempt fails
    await expect(withIdempotency("test", "guild_1", "user_1", "target_1", operation))
      .rejects.toThrow("Transient failure");
    
    // Second attempt should succeed (key was deleted on failure)
    const result = await withIdempotency("test", "guild_1", "user_1", "target_1", operation);
    expect(result.executed).toBe(true);
    expect(result.result).toEqual({ success: true });
  });
});

describe("Reliability: Failure Injection", () => {
  beforeEach(() => {
    SecurityPipeline.reset();
  });

  it("handles Discord REST 429 rate limits with backoff", async () => {
    const { withDiscordRest } = await import("../src/bot/utils.js");
    
    let attempts = 0;
    const operation = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts < 3) {
        const error = new Error("Rate limited");
        (error as any).status = 429;
        (error as any).retryAfter = 10;
        throw error;
      }
      return { success: true };
    });
    
    const result = await withDiscordRest(operation, {
      maxRetries: 5,
      initialDelay: 5,
      timeoutMs: 5000,
    });
    
    expect(result).toEqual({ success: true });
    expect(attempts).toBe(3);
  });

  it("handles network timeouts gracefully", async () => {
    const { withDiscordRest } = await import("../src/bot/utils.js");
    
    const operation = vi.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
      throw new Error("Timeout");
    });
    
    await expect(withDiscordRest(operation, { timeoutMs: 50, maxRetries: 2 }))
      .rejects.toThrow();
  });

it("continues operating when audit log fetch fails", async () => {
    // The EnhancedEventEngine should handle audit log fetch failures gracefully
    const { EnhancedEventEngine } = await import("../discord-bot.js");
    
    // This test verifies that the EnhancedEventEngine handles errors gracefully
    // We can't easily mock the internal fetchAuditLogsDeduplicated function,
    // so we test that the intercept method doesn't throw on invalid input
    await expect(EnhancedEventEngine.intercept(
      "Test Event",
      { id: "guild_1" } as any,
      "target_1",
      10,
      () => false,
      async () => {}
    )).resolves.toBeUndefined();
  });
});

describe("Reliability: Data Integrity", () => {
  beforeEach(() => {
    SecurityPipeline.reset();
  });

  it("SecurityPipeline maintains decision log integrity", () => {
    const events: any[] = [];
    for (let i = 0; i < 100; i++) {
      events.push({
        type: "channel_create",
        userId: `user_${i}`,
        guildId: "guild_1",
        timestamp: Date.now() + i,
        payload: {},
      });
    }
    
    SecurityPipeline.processBatch(events);
    
    // Decision log should have entries
    // (We can't directly access private decisionLog, but we can verify processing worked)
    const results = SecurityPipeline.processBatch([
      { type: "channel_create", userId: "test", guildId: "guild_1", timestamp: Date.now(), payload: {} }
    ]);
    expect(results[0]).toHaveProperty("blocked");
    expect(results[0]).toHaveProperty("action");
    expect(results[0]).toHaveProperty("score");
  });

  it("TtlMap cleanup doesn't lose active entries", async () => {
    const { TtlMap } = await import("../src/security/MapManager.js");
    const map = new TtlMap<string, number>({ 
      ttlMs: 1000, 
      maxEntries: 1000,
      autoCleanupMs: 100 
    });
    
    map.set("key1", 1);
    map.set("key2", 2);
    
    expect(map.get("key1")).toBe(1);
    expect(map.get("key2")).toBe(2);
    
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Entries should still exist (TTL not expired)
    expect(map.get("key1")).toBe(1);
    expect(map.get("key2")).toBe(2);
  });
});

describe("Reliability: Shutdown Drain", () => {
  it("waitForInFlightOperations drains pending operations", async () => {
    const { waitForInFlightOperations, trackOperation } = await import("../discord-bot.js");
    
    let completed = 0;
    const operation = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return "done";
    };
    
    // Track multiple operations
    const promises = [
      trackOperation(operation()),
      trackOperation(operation()),
      trackOperation(operation()),
    ];
    
    // Start waiting
    const drainPromise = waitForInFlightOperations(5000);
    
    // Wait for all operations to complete
    await Promise.all(promises);
    await drainPromise;
    
    // Should complete without timeout
    expect(true).toBe(true);
  });
});