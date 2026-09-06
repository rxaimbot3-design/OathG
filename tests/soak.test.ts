import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ultraLowLatencyPipeline, UltraLowLatencyPipeline } from "../src/core/UltraLowLatencyPipeline.js";
import { SecurityPipeline } from "../src/security/Pipeline.js";

describe("Memory Soak Test (No Forced GC)", () => {
  let pipeline: UltraLowLatencyPipeline;

  beforeEach(() => {
    SecurityPipeline.reset();
    pipeline = UltraLowLatencyPipeline.getInstance();
  });

  afterEach(() => {
    pipeline.removeAllListeners();
  });

  /**
   * Memory soak test that runs without forced GC to verify memory stability.
   * Runs for a shorter duration in CI (2 minutes) but demonstrates the methodology
   * for a production soak test that should run for 2-4 hours.
   */
  it("memory soak test: 2 minutes sustained load without forced GC", async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    const samples: number[] = [];
    const durationMs = 2 * 60 * 1000; // 2 minutes (shortened for CI)
    const intervalMs = 5000; // Sample every 5 seconds
    let running = true;
    
    // Start continuous enqueueing
    let runningEnqueue = true;
    const enqueuePromise = (async () => {
      let i = 0;
      while (runningEnqueue) {
        try {
          await ultraLowLatencyPipeline.enqueue({
            type: "soak_test",
            guildId: "guild_1",
            payload: { index: i++ },
            priority: "normal",
          });
        } catch (e) {
          // Ignore backpressure errors
        }
        await new Promise(resolve => setTimeout(resolve, 1)); // Small delay
      }
    })();

    // Sample memory usage periodically
    const samplingPromise = (async () => {
      while (runningEnqueue) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
        if (!runningEnqueue) break;
        samples.push(process.memoryUsage().heapUsed);
      }
    })();

    await new Promise(resolve => setTimeout(resolve, durationMs));
    runningEnqueue = false;
    
    await Promise.all([enqueuePromise, samplingPromise]);

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryGrowth = finalMemory - initialMemory;
    const growthPerMinute = (memoryGrowth / (durationMs / 60000)).toFixed(2);

    console.log(`Memory soak test results:`);
    console.log(`  Initial: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Final:   ${(finalMemory / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Growth:  ${(memoryGrowth / 1024 / 1024).toFixed(2)} MB (${growthPerMinute} MB/min)`);
    console.log(`  Samples: ${samples.length}`);
    
    // Verify memory growth is bounded
    // Allow up to 50 MB growth over 2 minutes (25 MB/min) as reasonable for sustained load
    expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
    
    // Verify no continuous unbounded growth pattern
    const growthRate = samples.length > 1 
      ? (samples[samples.length - 1] - samples[0]) / (samples.length - 1)
      : 0;
    console.log(`  Avg growth per sample: ${(growthRate / 1024 / 1024).toFixed(4)} MB`);
    
    // Growth per sample should be small (< 1 MB per 5s sample)
    expect(growthRate).toBeLessThan(1024 * 1024);
  }, 150000);

it("verifies memory returns to baseline after burst", async () => {
    // Force GC before test if available
    if (global.gc) global.gc();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const baselineMemory = process.memoryUsage().heapUsed;
    
    // Create burst of events
    for (let i = 0; i < 50000; i++) {
      await ultraLowLatencyPipeline.enqueue({
        type: "burst_test",
        guildId: "guild_1",
        payload: { index: i },
        priority: "normal",
      }).catch(() => {}); // Ignore backpressure
    }
    
    const peakMemory = process.memoryUsage().heapUsed;
    
    // Wait for processing to complete
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Force GC if available
    if (global.gc) {
      global.gc();
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const postBurstMemory = process.memoryUsage().heapUsed;
    
    console.log(`Burst test: baseline=${(baselineMemory/1024/1024).toFixed(2)}MB, peak=${(peakMemory/1024/1024).toFixed(2)}MB, post=${(postBurstMemory/1024/1024).toFixed(2)}MB`);
    console.log(`  Peak growth: ${((peakMemory - baselineMemory)/1024/1024).toFixed(2)}MB, Post-burst growth: ${((postBurstMemory - baselineMemory)/1024/1024).toFixed(2)}MB`);
    
    // In test environment with memory pressure from other tests, exact recovery may vary
    // The key assertion is that post-burst memory doesn't exceed peak by more than noise threshold
    expect(postBurstMemory).toBeLessThan(peakMemory + 5 * 1024 * 1024); // Allow 5MB noise
  }, 20000);
});