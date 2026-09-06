import { describe, it, expect, beforeEach } from "vitest";
import { UltraLowLatencyPipeline } from "../src/core/UltraLowLatencyPipeline.js";

describe("Queue Invariant Test: Global Queue Cap Enforcement", () => {
  let pipeline: UltraLowLatencyPipeline;

  beforeEach(() => {
    pipeline = UltraLowLatencyPipeline.getInstance();
    // Reset queues and metrics
    (pipeline as any).criticalQueue = [];
    (pipeline as any).highQueue = [];
    (pipeline as any).normalQueue = [];
    (pipeline as any).lowQueue = [];
    (pipeline as any).metrics = {
      processed: 0,
      failed: 0,
      avgLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      throughputPerSec: 0,
      queueDepth: 0,
      workerUtilization: 0,
      droppedEvents: 0,
      backpressureEvents: 0
    };
    (pipeline as any).backpressureActive = false;
  });

  const getTotalQueueDepth = () => {
    return (pipeline as any).criticalQueue.length + 
           (pipeline as any).highQueue.length + 
           (pipeline as any).normalQueue.length + 
           (pipeline as any).lowQueue.length;
  };

  it("enforces global MAX_QUEUE_SIZE = 10,000 under concurrent enqueue", async () => {
    const MAX_GLOBAL = 10000;
    const concurrentEnqueues = 15000;
    
    // Try to enqueue 15,000 events concurrently
    const promises = Array.from({ length: concurrentEnqueues }, (_, i) => 
      pipeline.enqueue({
        type: "test_event",
        guildId: "guild_1",
        payload: { index: i },
        priority: "normal" as const,
      }).catch(() => null) // Catch rejections from backpressure
    );
    
    await Promise.all(promises);
    
    // Verify global invariant: total queued <= MAX_GLOBAL
    const totalDepth = getTotalQueueDepth();
    expect(totalDepth).toBeLessThanOrEqual(MAX_GLOBAL);
    
    // Verify some events were dropped due to backpressure
    const metrics = pipeline.getMetrics();
    expect(metrics.droppedEvents).toBeGreaterThan(0);
  });

  it("enforces per-priority bounds within global cap", async () => {
    const MAX_GLOBAL = 10000;
    const MAX_CRITICAL = 1000;
    // Note: MAX_HIGH = 10000 but GLOBAL CAP is also 10000, so high is limited by global cap
    
    // Fill critical queue to its bound
    for (let i = 0; i < 1000; i++) {
      await pipeline.enqueue({
        type: "critical_event",
        guildId: "guild_1",
        payload: {},
        priority: "critical",
      });
    }
    
    // Try to add more critical - should be rejected
    await expect(pipeline.enqueue({
      type: "critical_event",
      guildId: "guild_1",
      payload: {},
      priority: "critical",
    })).rejects.toThrow("CRITICAL QUEUE FULL");
    
    // Fill with high priority - limited by GLOBAL CAP (not MAX_HIGH_QUEUE)
    for (let i = 0; i < 9000; i++) {
      await pipeline.enqueue({
        type: "high_event",
        guildId: "guild_1",
        payload: {},
        priority: "high",
      });
    }
    
    // Verify total doesn't exceed global max
    const totalDepth = getTotalQueueDepth();
    expect(totalDepth).toBeLessThanOrEqual(10000);
  });

  it("backpressure rejects low/normal priority when global cap reached", async () => {
    // Fill to global cap with normal priority
    for (let i = 0; i < 10000; i++) {
      await pipeline.enqueue({
        type: "normal_event",
        guildId: "guild_1",
        payload: {},
        priority: "normal",
      });
    }
    
    // Try to add normal - should be rejected with GLOBAL CAP error
    await expect(pipeline.enqueue({
      type: "normal_event",
      guildId: "guild_1",
      payload: {},
      priority: "normal",
    })).rejects.toThrow("GLOBAL CAP EXCEEDED");
    
    // Try to add low - should be rejected
    await expect(pipeline.enqueue({
      type: "low_event",
      guildId: "guild_1",
      payload: {},
      priority: "low",
    })).rejects.toThrow("GLOBAL CAP EXCEEDED");
    
    // High priority should also be rejected (global cap is absolute)
    await expect(pipeline.enqueue({
      type: "high_event",
      guildId: "guild_1",
      payload: {},
      priority: "high",
    })).rejects.toThrow("GLOBAL CAP EXCEEDED");
    
    const totalDepth = getTotalQueueDepth();
    expect(totalDepth).toBe(10000);
  });

  it("enforces invariant under concurrent mixed-priority enqueue", async () => {
    const MAX_GLOBAL = 10000;
    const promises: Promise<any>[] = [];
    
    // Mix of priorities
    for (let i = 0; i < 3000; i++) {
      promises.push(pipeline.enqueue({
        type: `event_${i}`,
        guildId: "guild_1",
        payload: { index: i },
        priority: "critical",
      }).catch(() => null));
    }
    
    for (let i = 0; i < 5000; i++) {
      promises.push(pipeline.enqueue({
        type: `event_${i}`,
        guildId: "guild_1",
        payload: { index: i },
        priority: "high",
      }).catch(() => null));
    }
    
    for (let i = 0; i < 5000; i++) {
      promises.push(pipeline.enqueue({
        type: `event_${i}`,
        guildId: "guild_1",
        payload: { index: i },
        priority: "normal",
      }).catch(() => null));
    }
    
    for (let i = 0; i < 5000; i++) {
      promises.push(pipeline.enqueue({
        type: `event_${i}`,
        guildId: "guild_1",
        payload: { index: i },
        priority: "low",
      }).catch(() => null));
    }
    
    await Promise.all(promises);
    
    const totalDepth = getTotalQueueDepth();
    expect(totalDepth).toBeLessThanOrEqual(10000);
  });

  it("recovery: backpressure clears when queue drains", async () => {
    // Fill to trigger global cap
    for (let i = 0; i < 10000; i++) {
      await pipeline.enqueue({
        type: "normal_event",
        guildId: "guild_1",
        payload: {},
        priority: "normal",
      });
    }
    
    // Try one more to trigger global cap error
    await expect(pipeline.enqueue({
      type: "trigger_bp",
      guildId: "guild_1",
      payload: {},
      priority: "normal",
    })).rejects.toThrow("GLOBAL CAP EXCEEDED");
    
    expect((pipeline as any).backpressureActive).toBe(true);
    
    // Simulate processing by clearing queues
    (pipeline as any).normalQueue = [];
    (pipeline as any).updateQueueDepth();
    
    // Should now accept low priority (which triggers recovery check)
    await pipeline.enqueue({
      type: "recovery_test",
      guildId: "guild_1",
      payload: {},
      priority: "low",
    });
    
    expect((pipeline as any).backpressureActive).toBe(false);
  });
});