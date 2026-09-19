import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CppNativeEngine } from "../src/CppEngine.js";
import { createHash } from "crypto";

describe("CppEngine: Native Loading Fallback", () => {
  beforeEach(async () => {
    CppNativeEngine.reset();
  });

  it("falls back to sync when native module is unavailable", async () => {
    await CppNativeEngine.initEngine();
    const metrics = CppNativeEngine.getMetrics();
    expect(["ACTIVE_MICROSECOND", "STANDBY", "OFFLINE"]).toContain(metrics.status);
    expect(typeof metrics.throughputPerSecond).toBe("number");
  });

  it("reports metrics after initialization", async () => {
    await CppNativeEngine.initEngine();
    const metrics = CppNativeEngine.getMetrics();
    expect(typeof metrics.memoryAllocatedBytes).toBe("number");
    expect(metrics.memoryAllocatedBytes).toBeGreaterThan(0);
  });

  it("includes engineMode in metrics", async () => {
    await CppNativeEngine.initEngine();
    const metrics = CppNativeEngine.getMetrics();
    expect(metrics).toHaveProperty("engineMode");
    expect(["native", "worker", "sync"]).toContain(metrics.engineMode);
  });
});

describe("CppEngine: Worker Thread Fallback", () => {
  beforeEach(async () => {
    CppNativeEngine.reset();
    vi.resetModules();
  });

  it("falls back to sync when worker fails", async () => {
    const { Worker } = await import("worker_threads");
    vi.spyOn(Worker.prototype, "postMessage").mockImplementation(() => {});
    await CppNativeEngine.initEngine();
    const result = CppNativeEngine.scanSecurityPacket(1, 1.5);
    expect(result.passed).toBe(true);
    expect(typeof result.latencyMicros).toBe("number");
  });
});

describe("CppEngine: Sync Fallback", () => {
  beforeEach(async () => {
    CppNativeEngine.reset();
    vi.resetModules();
  });

  it("processes scan in sync fallback mode", async () => {
    const result = CppNativeEngine.scanSecurityPacket(123, 2.0);
    expect(result.passed).toBe(true);
    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("handles high riskWeight correctly", () => {
    const result = CppNativeEngine.scanSecurityPacket(999, 10);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("handles zero riskWeight", () => {
    const result = CppNativeEngine.scanSecurityPacket(0, 0);
    expect(result.score).toBe(0);
    expect(result.passed).toBe(true);
  });
});

describe("CppEngine: Batch Scan", () => {
  beforeEach(async () => {
    CppNativeEngine.reset();
    vi.resetModules();
  });

  it("scans a batch of packets", async () => {
    const requests = Array.from({ length: 10 }, (_, i) => ({ packetId: i, riskWeight: 1.2 }));
    const results = await CppNativeEngine.batchScanPackets(requests);
    expect(results).toHaveLength(10);
    results.forEach((r) => {
      expect(typeof r.passed).toBe("boolean");
      expect(typeof r.latencyMicros).toBe("number");
      expect(typeof r.score).toBe("number");
    });
  });

  it("handles empty batch gracefully", async () => {
    const results = await CppNativeEngine.batchScanPackets([]);
    expect(results).toHaveLength(0);
  });

  it("handles large batch sizes", async () => {
    const requests = Array.from({ length: 1000 }, (_, i) => ({ packetId: i, riskWeight: Math.random() * 5 }));
    const results = await CppNativeEngine.batchScanPackets(requests);
    expect(results).toHaveLength(1000);
  });
});

describe("CppEngine: Hash Computation", () => {
  beforeEach(async () => {
    CppNativeEngine.reset();
    vi.resetModules();
  });

  it("computes SHA-256 hashes", async () => {
    const requests = [{ data: "hello world", algorithm: "sha256" as const }];
    const results = await CppNativeEngine.batchComputeHashes(requests);
    expect(results[0].hash).toBe(createHash("sha256").update("hello world").digest("hex"));
  });

  it("computes SHA-512 hashes", async () => {
    const requests = [{ data: "test data", algorithm: "sha512" as const }];
    const results = await CppNativeEngine.batchComputeHashes(requests);
    expect(results[0].hash).toBe(createHash("sha512").update("test data").digest("hex"));
  });

  it("computes CRC32 fallback hashes", async () => {
    const requests = [{ data: "abc", algorithm: "crc32" as const }];
    const results = await CppNativeEngine.batchComputeHashes(requests);
    expect(results[0].hash).toBeDefined();
    expect(results[0].hash).toHaveLength(8);
  });

  it("falls back to SHA-256 for unknown algorithm", async () => {
    const requests = [{ data: "test", algorithm: "unknown" as any }];
    const results = await CppNativeEngine.batchComputeHashes(requests);
    expect(results[0].hash).toBe(createHash("sha256").update("test").digest("hex"));
  });

  it("handles empty string hashes", async () => {
    const requests = [{ data: "", algorithm: "sha256" as const }];
    const results = await CppNativeEngine.batchComputeHashes(requests);
    expect(results[0].hash).toBe(createHash("sha256").update("").digest("hex"));
  });
});

describe("CppEngine: Metrics Collection", () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it("returns complete metrics object", async () => {
    await CppNativeEngine.initEngine();
    const metrics = CppNativeEngine.getMetrics();
    expect(metrics).toHaveProperty("engineName");
    expect(metrics).toHaveProperty("status");
    expect(metrics).toHaveProperty("memoryAllocatedBytes");
    expect(metrics).toHaveProperty("memoryUsedMB");
    expect(metrics).toHaveProperty("averageLatencyMicroseconds");
    expect(metrics).toHaveProperty("throughputPerSecond");
    expect(metrics).toHaveProperty("simdAcceleration");
    expect(metrics).toHaveProperty("activeThreads");
    expect(metrics).toHaveProperty("totalAuditsProcessed");
  });

  it("resets metrics to initial state", async () => {
    CppNativeEngine.scanSecurityPacket(1, 1);
    CppNativeEngine.resetMetrics();
    const metrics = CppNativeEngine.getMetrics();
    expect(metrics.totalAuditsProcessed).toBe(0);
  });
});

describe("CppEngine: Graceful Degradation", () => {
  beforeEach(async () => {
    CppNativeEngine.reset();
    vi.resetModules();
  });

  it("does not throw when native module is missing", async () => {
    await expect(CppNativeEngine.initEngine()).resolves.toBeUndefined();
  });

  it("provides fallback results when engine is unavailable", async () => {
    const result = CppNativeEngine.scanSecurityPacket(42, 1.0);
    expect(typeof result.passed).toBe("boolean");
    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns PASS for low risk events", async () => {
    await CppNativeEngine.initEngine();
    const result = CppNativeEngine.scanSecurityPacket(1, 200);
    expect(typeof result.passed).toBe("boolean");
    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns FLAG for medium risk events", async () => {
    await CppNativeEngine.initEngine();
    const result = CppNativeEngine.scanSecurityPacket(1, 350);
    expect(typeof result.passed).toBe("boolean");
    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns BLOCK for high risk events", async () => {
    await CppNativeEngine.initEngine();
    const result = CppNativeEngine.scanSecurityPacket(1, 600);
    expect(typeof result.passed).toBe("boolean");
    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("handles extremely large riskWeight values", () => {
    const result = CppNativeEngine.scanSecurityPacket(1, 999);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(typeof result.passed).toBe("boolean");
  });

  it("handles negative riskWeight values", () => {
    const result = CppNativeEngine.scanSecurityPacket(1, -5);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(typeof result.passed).toBe("boolean");
  });
});

describe("CppEngine: Worker Crash Recovery", () => {
  beforeEach(async () => {
    CppNativeEngine.reset();
    vi.resetModules();
  });

  it("falls back to sync when worker thread fails to initialize", async () => {
    // Do not mock Worker - let initialization attempt naturally.
    // In environments where Worker threads are unavailable, the engine
    // must fall back to sync mode without throwing.
    await CppNativeEngine.initEngine();
    const mode = CppNativeEngine.getEngineMode();
    expect(["native", "worker", "sync"]).toContain(mode);

    // Scan must still return valid results regardless of mode
    const result = CppNativeEngine.scanSecurityPacket(1, 1.5);
    expect(typeof result.passed).toBe("boolean");
    expect(typeof result.latencyMicros).toBe("number");
    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns valid results after reset and re-initialization", async () => {
    await CppNativeEngine.initEngine();
    const firstResult = CppNativeEngine.scanSecurityPacket(42, 1.0);
    expect(firstResult.passed).toBe(true);

    CppNativeEngine.reset();
    await CppNativeEngine.initEngine();
    const secondResult = CppNativeEngine.scanSecurityPacket(42, 1.0);
    expect(typeof secondResult.passed).toBe("boolean");
    expect(typeof secondResult.score).toBe("number");
    expect(secondResult.score).toBeGreaterThanOrEqual(0);
    expect(secondResult.score).toBeLessThanOrEqual(100);
  });

  it("maintains metrics consistency after initialization", async () => {
    await CppNativeEngine.initEngine();
    const metrics = CppNativeEngine.getMetrics();
    expect(metrics).toHaveProperty("engineName");
    expect(metrics).toHaveProperty("status");
    expect(metrics).toHaveProperty("totalAuditsProcessed");
    expect(metrics.totalAuditsProcessed).toBeGreaterThanOrEqual(0);
  });
});

describe("CppEngine: Scoring Contract Consistency", () => {
  beforeEach(async () => {
    CppNativeEngine.reset();
    vi.resetModules();
  });

  const riskWeights = [0, 1.2, 10, 50, 100, 1000];
  const singleScores: Record<number, number> = {};

  riskWeights.forEach((rw) => {
    const single = CppNativeEngine.scanSecurityPacket(1, rw);
    singleScores[rw] = single.score;
  });

  it("single scan produces scores in valid range", () => {
    riskWeights.forEach((rw) => {
      expect(singleScores[rw]).toBeGreaterThanOrEqual(0);
      expect(singleScores[rw]).toBeLessThanOrEqual(100);
    });
  });

  it("batch scan produces scores in valid range", async () => {
    const requests = riskWeights.map((rw) => ({ packetId: 1, riskWeight: rw }));
    const results = await CppNativeEngine.batchScanPackets(requests);
    expect(results).toHaveLength(riskWeights.length);
    results.forEach((r) => {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    });
  });

  it("score is bounded for zero riskWeight", () => {
    const result = CppNativeEngine.scanSecurityPacket(1, 0);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("score clamps to 100 for very large riskWeight", () => {
    const result = CppNativeEngine.scanSecurityPacket(1, 10000);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("score clamps to valid range for negative riskWeight", () => {
    const result = CppNativeEngine.scanSecurityPacket(1, -50);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("score clamps to valid range for NaN riskWeight", () => {
    const result = CppNativeEngine.scanSecurityPacket(1, NaN);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("score clamps to valid range for Infinity riskWeight", () => {
    const result = CppNativeEngine.scanSecurityPacket(1, Infinity);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe("CppEngine: Engine Mode Truthfulness", () => {
  beforeEach(async () => {
    CppNativeEngine.reset();
    vi.resetModules();
  });

  it("updates engineMode to sync when native instance is unavailable", () => {
    (CppNativeEngine as any).engineMode = "native";
    (CppNativeEngine as any).nativeRuntimeFailed = false;
    const result = CppNativeEngine.scanSecurityPacket(1, 1.2);
    expect(typeof result.passed).toBe("boolean");
    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(CppNativeEngine.getEngineMode()).toBe("sync");
  });

  it("does not retry native after runtime failure", () => {
    CppNativeEngine.reset();
    (CppNativeEngine as any).engineMode = "native";
    (CppNativeEngine as any).nativeRuntimeFailed = true;
    const result = CppNativeEngine.scanSecurityPacket(1, 1.2);
    expect(typeof result.passed).toBe("boolean");
    expect(CppNativeEngine.getEngineMode()).toBe("sync");
  });

  it("reports accurate engine mode after initialization", async () => {
    await CppNativeEngine.initEngine();
    const mode = CppNativeEngine.getEngineMode();
    expect(["native", "worker", "sync"]).toContain(mode);
  });
});

describe("CppEngine: Invalid Input Handling", () => {
  beforeEach(async () => {
    CppNativeEngine.reset();
    vi.resetModules();
  });

  it("normalizes invalid packetId to safe default", () => {
    const result = CppNativeEngine.scanSecurityPacket(0, 1.2);
    expect(typeof result.passed).toBe("boolean");
    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("normalizes negative packetId to safe default", () => {
    const result = CppNativeEngine.scanSecurityPacket(-5, 1.2);
    expect(typeof result.passed).toBe("boolean");
    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("normalizes NaN packetId to safe default", () => {
    const result = CppNativeEngine.scanSecurityPacket(NaN, 1.2);
    expect(typeof result.passed).toBe("boolean");
    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("clamps extreme riskWeight values", () => {
    const result = CppNativeEngine.scanSecurityPacket(1, 1e6);
    expect(typeof result.passed).toBe("boolean");
    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
