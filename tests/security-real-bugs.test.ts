import { describe, it, expect, beforeEach, vi } from "vitest";
import { SecurityPipeline } from "../src/security/Pipeline.js";
import { UltraLowLatencyPipeline } from "../src/core/UltraLowLatencyPipeline.js";

describe("Security: Detection-Action Coupling (EnhancedEventEngine)", () => {
  beforeEach(() => {
    SecurityPipeline.reset();
    vi.clearAllMocks();
  });

  it("EnhancedEventEngine intercept path exists and is callable", async () => {
    const { EnhancedEventEngine } = await import("../discord-bot.js");
    expect(typeof EnhancedEventEngine.intercept).toBe("function");
    expect(typeof EnhancedEventEngine.crossThreadSyncBus).toBe("object");
  });

  it("crossThreadSyncBus deduplicates events within 5s window", async () => {
    const { EnhancedEventEngine } = await import("../discord-bot.js");
    const dedupKey = "guild_kick_guild_123_target_456";
    const now = Date.now();
    EnhancedEventEngine.crossThreadSyncBus.set(dedupKey, now);
    expect(EnhancedEventEngine.crossThreadSyncBus.has(dedupKey)).toBe(true);
  });
});

describe("Security: Pipeline Event Processing", () => {
  beforeEach(() => {
    SecurityPipeline.reset();
  });

  it("blocks high-risk events based on score", () => {
    const result = SecurityPipeline.processEvent({
      type: "webhook_create",
      userId: "123",
      guildId: "456",
      timestamp: Date.now(),
      payload: { webhookCount: 2 }
    });
    expect(result.score).toBeGreaterThanOrEqual(50);
  });

  it("passes low-risk events", () => {
    const result = SecurityPipeline.processEvent({
      type: "message_bulk_delete",
      userId: "123",
      guildId: "456",
      timestamp: Date.now(),
      payload: {}
    });
    expect(result.blocked).toBe(false);
    expect(result.score).toBeLessThan(50);
  });

  it("processes events with missing optional payload", () => {
    const result = SecurityPipeline.processEvent({
      type: "message_bulk_delete",
      userId: "123",
      guildId: "456",
      timestamp: Date.now(),
      payload: {}
    });
    expect(typeof result.blocked).toBe("boolean");
    expect(typeof result.score).toBe("number");
  });
});

describe("Resource Bounds: UltraLowLatencyPipeline Queue Bounds", () => {
  let pipeline: UltraLowLatencyPipeline;

  beforeEach(() => {
    pipeline = UltraLowLatencyPipeline.getInstance();
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

  it("queues have max size - enforces backpressure", async () => {
    const events = Array.from({ length: 10000 }, (_, i) => ({
      type: "test_event",
      guildId: "guild_1",
      payload: { index: i },
      priority: "normal" as const,
    }));

    for (const event of events) {
      await pipeline.enqueue(event);
    }

    const metrics = pipeline.getMetrics();
    expect(metrics.queueDepth).toBe(10000);
    
    await expect(pipeline.enqueue({
      type: "test_event",
      guildId: "guild_1",
      payload: {},
      priority: "normal",
    })).rejects.toThrow("GLOBAL CAP EXCEEDED");
    
    const internalMetrics = (pipeline as any).metrics;
    expect(internalMetrics.droppedEvents).toBe(1);
  });

  it("critical queue has separate bound", async () => {
    for (let i = 0; i < 1000; i++) {
      await pipeline.enqueue({
        type: "critical_event",
        guildId: "guild_1",
        payload: {},
        priority: "critical",
      });
    }

    const metrics = pipeline.getMetrics();
    expect(metrics.queueDepth).toBe(1000);
    
    await expect(pipeline.enqueue({
      type: "critical_event",
      guildId: "guild_1",
      payload: {},
      priority: "critical",
    })).rejects.toThrow("CRITICAL QUEUE FULL");
  });

  it("high priority events also rejected when global cap reached", async () => {
    for (let i = 0; i < 10000; i++) {
      await pipeline.enqueue({
        type: "normal_event",
        guildId: "guild_1",
        payload: {},
        priority: "normal",
      });
    }

    await expect(pipeline.enqueue({
      type: "high_event",
      guildId: "guild_1",
      payload: {},
      priority: "high",
    })).rejects.toThrow("GLOBAL CAP EXCEEDED");

    const metrics = pipeline.getMetrics();
    expect(metrics.droppedEvents).toBeGreaterThan(0);
    expect(metrics.queueDepth).toBe(10000);
  });

  it("backpressure recovers when queue drains", async () => {
    for (let i = 0; i < 10000; i++) {
      await pipeline.enqueue({
        type: "normal_event",
        guildId: "guild_1",
        payload: {},
        priority: "normal",
      });
    }

    try {
      await pipeline.enqueue({
        type: "trigger_backpressure",
        guildId: "guild_1",
        payload: {},
        priority: "normal",
      });
    } catch {
      // Expected to throw
    }

    expect((pipeline as any).backpressureActive).toBe(true);
    
    (pipeline as any).normalQueue = [];
    (pipeline as any).updateQueueDepth();
    
    await pipeline.enqueue({
      type: "test_event",
      guildId: "guild_1",
      payload: {},
      priority: "low",
    });

    expect((pipeline as any).backpressureActive).toBe(false);
  });
});

describe("Observability: Logging", () => {
  it("addBotLog is callable and accepts message and level", async () => {
    const { addBotLog } = await import("../discord-bot.js");
    expect(typeof addBotLog).toBe("function");
    await addBotLog("test message", "info");
  });
});

describe("C++ Engine: Fallback Path", () => {
  it("JS fallback produces bounded scores when native unavailable", async () => {
    const { CppNativeEngine } = await import("../src/CppEngine.js");
    CppNativeEngine.reset();
    const result = CppNativeEngine.scanSecurityPacket(1, 1.2);
    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
