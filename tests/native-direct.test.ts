import { CppNativeEngine } from "./src/CppEngine.js";
import { SecurityPipeline } from "./src/security/Pipeline.js";
import { describe, it, expect, beforeAll } from "vitest";

describe("Native Module Direct Test", () => {
  beforeAll(async () => {
    await CppNativeEngine.initEngine();
    console.log('Engine mode:', CppNativeEngine.getEngineMode());
  });

  it("should test SecurityPipeline directly", () => {
    // Test what SecurityPipeline returns for various event types
    const testCases = [
      { type: "role_update", payload: { riskWeight: 50, packetId: 1 } },
      { type: "permission_update", payload: { riskWeight: 50, packetId: 1 } },
      { type: "guild_kick", payload: { riskWeight: 50, packetId: 1 } },
      { type: "channel_delete", payload: { riskWeight: 50, packetId: 1 } },
      { type: "unknown", payload: { riskWeight: 50, packetId: 1 } },
    ];

    for (const tc of testCases) {
      const event = {
        type: tc.type,
        userId: "1",
        guildId: "1",
        timestamp: Date.now(),
        payload: tc.payload
      };
      const result = SecurityPipeline.processEvent(event);
      console.log(`Pipeline: type=${tc.type}, score=${result.score}, blocked=${result.blocked}, action=${result.action}, rule=${result.rule}`);
    }
  });

  it("should test native ScanPacket vs ScanBatch directly", async () => {
    // Access native instance directly
    const nativeInstance = (CppNativeEngine as any).nativeInstance;
    if (!nativeInstance) {
      console.log("Native instance not available");
      return;
    }

    // Test native ScanPacket directly with eventType=0 (kUnknown)
    const singleResult = nativeInstance.scanPacket(1, { 
      packetId: 1, 
      eventType: 0,  // kUnknown
      userId: 1, 
      guildId: 1,
      riskWeight: 50
    });
    console.log("Native ScanPacket (eventType=0, RW=50):", JSON.stringify(singleResult, null, 2));

    // Test native ScanBatch directly with eventType=0 (kUnknown)
    const batchResult = nativeInstance.scanBatch([{ 
      packetId: 1, 
      event: { 
        eventType: 0, 
        userId: 1, 
        guildId: 1,
        channelCount: 0,
        roleCount: 0,
        banCount: 0,
        kickCount: 0,
        webhookCount: 0,
        botCount: 0,
        permsAdded: 0,
        permsRemoved: 0,
        eventCount1s: 0,
        eventCount10s: 0,
        timestamp: Date.now(),
        riskWeight: 50
      }
    }]);
    console.log("Native ScanBatch (eventType=0, RW=50):", JSON.stringify(batchResult[0], null, 2));

    // Test with eventType that triggers a rule
    const singleResult2 = nativeInstance.scanPacket(2, { 
      packetId: 2, 
      eventType: 2,  // kMassRoleUpdate
      userId: 1, 
      guildId: 1,
      roleCount: 5,  // triggers rule
      riskWeight: 50
    });
    console.log("Native ScanPacket (eventType=2, roleCount=5, RW=50):", JSON.stringify(singleResult2, null, 2));

    const batchResult2 = nativeInstance.scanBatch([{ 
      packetId: 2, 
      event: { 
        eventType: 2,  // kMassRoleUpdate
        userId: 1, 
        guildId: 1,
        roleCount: 5,  // triggers rule
        riskWeight: 50
      }
    }]);
    console.log("Native ScanBatch (eventType=2, roleCount=5, RW=50):", JSON.stringify(batchResult2[0], null, 2));
  });
});