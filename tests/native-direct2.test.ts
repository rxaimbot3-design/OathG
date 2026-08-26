import { CppNativeEngine } from "../src/CppEngine.js";
import { describe, it, expect, beforeAll } from "vitest";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const nativeModulePath = path.join(__dirname, "..", "build", "Release", "security_engine.node");

describe("Native Module Direct Test - Require Native", () => {
  beforeAll(async () => {
    await CppNativeEngine.initEngine();
    console.log('Engine mode:', CppNativeEngine.getEngineMode());
  });

  it("should test native module directly via require", () => {
    // Require the native module directly
    const nativeModule = require(nativeModulePath);
    const engine = new nativeModule.SecurityEngine();
    console.log("Native engine created:", !!engine);

    // Test ScanPacket with eventType=0 (kUnknown), riskWeight=50
    const singleResult = engine.scanPacket(1, { 
      packetId: 1, 
      eventType: 0,  // kUnknown
      userId: 1, 
      guildId: 1,
      riskWeight: 50
    });
    console.log("Native ScanPacket (eventType=0, RW=50):", JSON.stringify(singleResult, null, 2));

    // Test ScanBatch with eventType=0 (kUnknown), riskWeight=50
    const batchResult = engine.scanBatch([{ 
      packetId: 1, 
      eventType: 0,  // kUnknown
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
    }]);
    console.log("Native ScanBatch (eventType=0, RW=50):", JSON.stringify(batchResult[0], null, 2));

    // Test ScanPacket with eventType=2 (kMassRoleUpdate), roleCount=5 (triggers rule)
    const singleResult2 = engine.scanPacket(2, { 
      packetId: 2, 
      eventType: 2,  // kMassRoleUpdate
      userId: 1, 
      guildId: 1,
      roleCount: 5,  // triggers rule (>=3)
      riskWeight: 50
    });
    console.log("Native ScanPacket (eventType=2, roleCount=5, RW=50):", JSON.stringify(singleResult2, null, 2));

    // Test ScanBatch with eventType=2 (kMassRoleUpdate), roleCount=5
    const batchResult2 = engine.scanBatch([{ 
      packetId: 2, 
      eventType: 2,  // kMassRoleUpdate
      userId: 1, 
      guildId: 1,
      roleCount: 5,  // triggers rule
      riskWeight: 50
    }]);
    console.log("Native ScanBatch (eventType=2, roleCount=5, RW=50):", JSON.stringify(batchResult2[0], null, 2));

    // Test no-rule case with riskWeight=50
    const singleNoRule = engine.scanPacket(3, { 
      packetId: 3, 
      eventType: 0,  // kUnknown - no rule
      userId: 1, 
      guildId: 1,
      riskWeight: 50
    });
    console.log("Native ScanPacket (no rule, RW=50):", JSON.stringify(singleNoRule, null, 2));

    const batchNoRule = engine.scanBatch([{ 
      packetId: 3, 
      eventType: 0,  // kUnknown - no rule
      userId: 1, 
      guildId: 1,
      riskWeight: 50
    }]);
    console.log("Native ScanBatch (no rule, RW=50):", JSON.stringify(batchNoRule[0], null, 2));
  });
});