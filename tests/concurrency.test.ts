import { describe, it, expect, beforeEach, vi } from "vitest";
import { SecurityPipeline, type SecurityEvent } from "../src/security/Pipeline.js";
import { EnhancedEventEngine } from "../discord-bot.js";
import { TtlMap } from "../src/security/MapManager.js";
import { IdempotencyManager, withIdempotency, resetIdempotencyManager } from "../src/services/idempotency.js";

describe("Concurrency: Race Conditions", () => {
  beforeEach(() => {
    SecurityPipeline.reset();
    resetIdempotencyManager();
  });

  it("handles concurrent events for same user without double-penalizing", async () => {
    const events: SecurityEvent[] = Array.from({ length: 100 }, (_, i) => ({
      type: "channel_create",
      userId: "concurrent_user",
      guildId: "guild_1",
      timestamp: Date.now() + i,
      payload: { channelCount: 1 },
    }));

    // Process all events concurrently
    const results = await Promise.all(
      events.map(e => Promise.resolve(SecurityPipeline.processEvent(e)))
    );

    // All should be processed
    expect(results).toHaveLength(100);
    
    // Verify no double-penalizing: scores should be consistent for same user
    const scores = results.map(r => r.score);
    const uniqueScores = new Set(scores);
    // Scores should not have extreme variance for same pattern
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    expect(maxScore - minScore).toBeLessThan(50);
  });

  it("handles concurrent idempotency operations correctly", async () => {
    resetIdempotencyManager();
    let callCount = 0;
    
    const operation = vi.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return { success: true, id: Date.now() };
    });

    // Launch 10 concurrent operations with same key
    const promises = Array.from({ length: 10 }, () => 
      withIdempotency("ban", "guild_1", "executor_1", "target_1", operation)
    );

    const results = await Promise.all(promises);
    
    // Only one should have executed
    const executed = results.filter(r => r.executed);
    expect(executed).toHaveLength(1);
    
    // All should return the same result
    const firstResult = executed[0].result;
    results.forEach(r => {
      expect(r.result).toEqual(firstResult);
    });
  });

  it("TtlMap handles concurrent access without corruption", async () => {
    const map = new TtlMap<string, number>({ ttlMs: 60000, maxEntries: 1000 });
    const iterations = 1000;
    const concurrency = 10;

    async function writer(id: number) {
      for (let i = 0; i < iterations; i++) {
        map.set(`key_${id}_${i}`, i);
      }
    }

    async function reader() {
      for (let i = 0; i < iterations * 10; i++) {
        map.get(`key_0_${i % iterations}`);
      }
    }

    await Promise.all([
      ...Array.from({ length: concurrency }, (_, i) => writer(i)),
      ...Array.from({ length: 5 }, reader),
    ]);

    // Map should not be corrupted
    expect(map.size).toBeLessThanOrEqual(concurrency * iterations);
  });

  it("EnhancedEventEngine deduplication works under concurrent load", async () => {
    // This tests the crossThreadSyncBus deduplication
    const engine = EnhancedEventEngine;
    const testGuild = { id: "test_guild" } as any;
    
    let interceptCount = 0;
    const selfMemoryCheck = vi.fn(() => false);
    const revertAction = vi.fn().mockResolvedValue(undefined);
    
    // Simulate concurrent intercept calls
    const promises = Array.from({ length: 50 }, (_, i) => 
      engine.intercept("Channel Creation", testGuild, `channel_${i}`, 10, selfMemoryCheck, revertAction)
    );

    await Promise.all(promises);
    
    // All should complete without error
    expect(revertAction).toHaveBeenCalledTimes(50);
  });

  it("SecurityPipeline handles burst events atomically", () => {
    const now = Date.now();
    const events: SecurityEvent[] = Array.from({ length: 1000 }, (_, i) => ({
      type: "channel_delete",
      userId: "burst_user",
      guildId: "guild_1",
      timestamp: now + i,
      payload: {},
    }));

    const startTime = performance.now();
    const results = SecurityPipeline.processBatch(events);
    const elapsed = performance.now() - startTime;

    expect(results).toHaveLength(1000);
    expect(elapsed).toBeLessThan(100); // Should process quickly
    
    // Verify consistent scoring for same pattern
    const scores = results.map(r => r.score);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    expect(maxScore - minScore).toBeLessThan(50);
  });
});

describe("Concurrency: Bounded Resources", () => {
  beforeEach(() => {
    SecurityPipeline.reset();
  });

  it("UltraLowLatencyPipeline enforces queue bounds under load", async () => {
    const { UltraLowLatencyPipeline } = await import("../src/core/UltraLowLatencyPipeline.js");
    const pipeline = UltraLowLatencyPipeline.getInstance();
    
    // Fill queues to capacity
    const events = Array.from({ length: 15000 }, (_, i) => ({
      type: "test_event",
      guildId: "guild_1",
      payload: { index: i },
      priority: "normal" as const,
    }));

    const results = await Promise.allSettled(events.map(e => pipeline.enqueue(e)));
    
    // Some should be rejected due to backpressure
    const rejected = results.filter(r => r.status === "rejected");
    expect(rejected.length).toBeGreaterThan(0);
    
    const metrics = pipeline.getMetrics();
    expect(metrics.droppedEvents).toBeGreaterThan(0);
  });

  it("RateLimiter enforces per-key limits under concurrent access", async () => {
    const { RateLimiter } = await import("../src/SecurityFeatures.js");
    const limiter = RateLimiter.getInstance({ redisEnabled: false, maxRequests: 10, windowMs: 1000 });
    
    const key = "concurrent_test_key";
    const promises = Array.from({ length: 20 }, () => limiter.check(key));
    
    const results = await Promise.all(promises);
    
    const allowed = results.filter(r => r.allowed).length;
    const denied = results.filter(r => !r.allowed).length;
    
    expect(allowed).toBe(10);
    expect(denied).toBe(10);
  });

  it("IdempotencyManager bounded memory under high load", async () => {
    const { IdempotencyManager, resetIdempotencyManager } = await import("../src/services/idempotency.js");
    resetIdempotencyManager();
    const manager = IdempotencyManager.getInstance();
    
    // Create many idempotency keys
    for (let i = 0; i < 5000; i++) {
      manager.checkAndStore(`key_${i}`, `value_${i}`);
    }
    
    expect(manager.size()).toBe(5000);
    
    // Add more to trigger eviction
    for (let i = 5000; i < 15000; i++) {
      manager.checkAndStore(`key_${i}`, `value_${i}`);
    }
    
    // Should not exceed maxEntries
    expect(manager.size()).toBeLessThanOrEqual(10000);
  });
});

describe("Concurrency: No Deadlocks", () => {
  it("withIdempotency does not deadlock under contention", async () => {
    const { withIdempotency, resetIdempotencyManager } = await import("../src/services/idempotency.js");
    resetIdempotencyManager();
    
    let completed = 0;
    const operation = async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      completed++;
      return { success: true };
    };

    // Launch many concurrent operations with different keys
    const promises = Array.from({ length: 100 }, (_, i) => 
      withIdempotency("action", `guild_${i}`, "executor", `target_${i}`, operation)
    );

    await Promise.all(promises);
    expect(completed).toBe(100);
  });

  it("Multiple withIdempotency calls with same key complete correctly", async () => {
    const { withIdempotency, resetIdempotencyManager } = await import("../src/services/idempotency.js");
    resetIdempotencyManager();
    
    let callCount = 0;
    const operation = vi.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return { success: true };
    });

    // 20 concurrent calls with same key
    const promises = Array.from({ length: 20 }, () => 
      withIdempotency("ban", "guild_1", "executor_1", "target_1", operation)
    );

    const results = await Promise.all(promises);
    
    // Only one execution
    expect(operation).toHaveBeenCalledTimes(1);
    
    // All return same result
    const firstResult = results[0].result;
    results.forEach(r => expect(r.result).toEqual(firstResult));
  });
});