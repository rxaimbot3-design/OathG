import { CppNativeEngine } from './src/CppEngine.js';

await CppNativeEngine.initEngine();

console.log('Engine mode:', CppNativeEngine.getEngineMode());

// Test identical packets via single and batch
const single = CppNativeEngine.scanSecurityPacket(1, 50);
const batch = await CppNativeEngine.batchScanPackets([{ packetId: 1, riskWeight: 50, eventType: 0, channelCount: 0 }]);

console.log('Single packet (riskWeight=50):', JSON.stringify(single, null, 2));
console.log('Batch packet (riskWeight=50):', JSON.stringify(batch[0], null, 2));

// Test multiple risk weights
for (const rw of [0, 10, 25, 50, 75, 100, 200, 500]) {
  const s = CppNativeEngine.scanSecurityPacket(1, rw);
  const b = await CppNativeEngine.batchScanPackets([{ packetId: 1, riskWeight: rw, eventType: 0, channelCount: 0 }]);
  console.log(`RW=${rw}: single score=${s.score}, batch score=${b[0].score}, match=${s.score === b[0].score}`);
}