import { CppNativeEngine } from "./src/CppEngine.js";
import { describe, it, expect, beforeAll } from "vitest";

describe("Single vs Batch Scoring Consistency", () => {
  beforeAll(async () => {
    await CppNativeEngine.initEngine();
    console.log('Engine mode:', CppNativeEngine.getEngineMode());
  });

  it("should produce identical scores for single and batch paths", async () => {
    const testCases = [0, 10, 25, 50, 75, 100, 200, 500];
    
    for (const riskWeight of testCases) {
      const single = CppNativeEngine.scanSecurityPacket(1, riskWeight);
      const batch = await CppNativeEngine.batchScanPackets([{ 
        packetId: 1, 
        riskWeight, 
        eventType: 0, 
        channelCount: 0 
      }]);
      
      console.log(`RW=${riskWeight}: single score=${single.score}, batch score=${batch[0].score}, match=${single.score === batch[0].score}`);
      
      expect(batch[0].score).toBe(single.score);
      expect(batch[0].passed).toBe(single.passed);
    }
  });
});