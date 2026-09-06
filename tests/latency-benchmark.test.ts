import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ultraLowLatencyPipeline, UltraLowLatencyPipeline } from "../src/core/UltraLowLatencyPipeline.js";
import { EnhancedEventEngine } from "../discord-bot.js";
import { SecurityPipeline } from "../src/security/Pipeline.js";

describe("Production-Path Latency Measurement", () => {
  let pipeline: UltraLowLatencyPipeline;

  beforeEach(() => {
    SecurityPipeline.reset();
    pipeline = UltraLowLatencyPipeline.getInstance();
  });

  afterEach(() => {
    pipeline.removeAllListeners();
  });

  it("measures end-to-end latency for pipeline events", async () => {
    const latencies: number[] = [];
    const sampleCount = 1000;
    
    pipeline.on("processed", (event) => {
      const latency = Date.now() - event.timestamp;
      latencies.push(latency);
    });

    // Enqueue events with timestamps
    for (let i = 0; i < sampleCount; i++) {
      await pipeline.enqueue({
        type: "benchmark_event",
        guildId: "guild_1",
        payload: { index: i },
        priority: "normal",
      });
    }

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Calculate percentiles
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.50)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    console.log(`Pipeline Latency (ms): avg=${avg.toFixed(2)}, p50=${p50}, p95=${p95}, p99=${p99}`);
    
    // Verify latencies are reasonable (worker thread adds ~100-300ms overhead)
    expect(p50).toBeLessThan(300); // P50 < 300ms (worker thread overhead)
    expect(p95).toBeLessThan(400); // P95 < 400ms
    expect(p99).toBeLessThan(500); // P99 < 500ms
  });

  it("measures latency by priority", async () => {
    const latenciesByPriority: Record<string, number[]> = {
      critical: [],
      high: [],
      normal: [],
      low: [],
    };
    
    pipeline.on("processed", (event) => {
      const latency = Date.now() - event.timestamp;
      latenciesByPriority[event.priority].push(latency);
    });

    // Enqueue 250 events per priority
    for (const priority of ["critical", "high", "normal", "low"] as const) {
      for (let i = 0; i < 250; i++) {
        await pipeline.enqueue({
          type: "benchmark_event",
          guildId: "guild_1",
          payload: { index: i },
          priority,
        });
      }
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    for (const priority of ["critical", "high", "normal", "low"] as const) {
      const latencies = latenciesByPriority[priority].sort((a, b) => a - b);
      if (latencies.length === 0) continue;
      
      const p50 = latencies[Math.floor(latencies.length * 0.50)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];
      
      console.log(`${priority} latency (ms): p50=${p50}, p95=${p95}, p99=${p99}, count=${latencies.length}`);
    }
  });

  it("measures SecurityPipeline decision latency", () => {
    const events = Array.from({ length: 10000 }, (_, i) => ({
      type: "channel_create",
      userId: `user_${i}`,
      guildId: "guild_1",
      timestamp: Date.now() + i,
      payload: { channelCount: 1 },
    }));

    const start = process.hrtime.bigint();
    const results = SecurityPipeline.processBatch(events);
    const end = process.hrtime.bigint();
    
    const totalNs = Number(end - start);
    const perEventNs = totalNs / events.length;
    const perEventMs = perEventNs / 1e6;

    console.log(`SecurityPipeline: ${events.length} events in ${(totalNs / 1e6).toFixed(2)}ms`);
    console.log(`Per-event: ${perEventMs.toFixed(4)}ms (${perEventNs}ns)`);
    
    // Verify all events processed
    expect(results.length).toBe(events.length);
    
    // Verify per-event latency is low
    expect(perEventMs).toBeLessThan(0.1); // < 0.1ms per event
  });

  it("measures C++ engine latency", async () => {
    const { CppNativeEngine } = await import("../src/CppEngine.js");
    
    // Initialize the engine
    await CppNativeEngine.initEngine();
    
    const latencies: number[] = [];
    const iterations = 10000;
    
    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      CppNativeEngine.scanSecurityPacket(i, Math.floor(Math.random() * 100));
      const end = process.hrtime.bigint();
      
      latencies.push(Number(end - start) / 1e6); // Convert to ms
    }
    
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.50)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    
    console.log(`C++ Engine latency (ms): p50=${p50.toFixed(4)}, p95=${p95.toFixed(4)}, p99=${p99.toFixed(4)}`);
    
    expect(p99).toBeLessThan(1); // P99 < 1ms for C++ engine
  });

  it("measures end-to-end production path latency stages", async () => {
    const stages = {
      enqueue: [] as number[],
      middleware: [] as number[],
      cppEngine: [] as number[],
      handler: [] as number[],
      total: [] as number[],
    };
    
    // Register handler that measures its own latency
    const pipeline = UltraLowLatencyPipeline.getInstance();
    
    pipeline.addGlobalMiddleware(async (event) => {
      const start = process.hrtime.bigint();
      // Simulate middleware work
      await new Promise(resolve => setTimeout(resolve, 0));
      const end = process.hrtime.bigint();
      stages.middleware.push(Number(end - start) / 1e6);
      return event;
    });
    
    pipeline.registerHandler("latency_test", async (event) => {
      const handlerStart = process.hrtime.bigint();
      // Simulate handler work
      await new Promise(resolve => setTimeout(resolve, 0));
      const handlerEnd = process.hrtime.bigint();
      stages.handler.push(Number(handlerEnd - handlerStart) / 1e6);
    });
    
    const sampleCount = 1000;
    const totalLatencies: number[] = [];
    
    for (let i = 0; i < sampleCount; i++) {
      const totalStart = process.hrtime.bigint();
      
      await pipeline.enqueue({
        type: "latency_test",
        guildId: "guild_1",
        payload: { index: i },
        priority: "normal",
      });
      
      const totalEnd = process.hrtime.bigint();
      totalLatencies.push(Number(totalEnd - totalStart) / 1e6);
    }
    
    // Wait for all to process
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    totalLatencies.sort((a, b) => a - b);
    const p50 = totalLatencies[Math.floor(totalLatencies.length * 0.50)];
    const p95 = totalLatencies[Math.floor(totalLatencies.length * 0.95)];
    const p99 = totalLatencies[Math.floor(totalLatencies.length * 0.99)];
    
    console.log(`End-to-end latency (ms): p50=${p50.toFixed(2)}, p95=${p95.toFixed(2)}, p99=${p99.toFixed(2)}`);
    
    expect(totalLatencies.length).toBe(1000);
  });
});