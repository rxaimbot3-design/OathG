# Benchmark Results

Generated: 2026-08-26T20:08:00.400Z

Environment:
- Node.js: v22.22.3
- CPUs: 4 (x64)
- Platform: linux
- Engine Mode: native

## Summary

| Test | Throughput/s | p50 (us) | p95 (us) | p99 (us) | Avg (us) | Peak Mem (MB) | CPU % | Events | Duration (ms) |
|------|-------------|----------|----------|----------|----------|---------------|-------|--------|---------------|
| Node SHA-256 (1K) | 142857 | 3 | 13 | 71 | 7 | 8.36 | 23.94 | 1000 | 7 |
| Node SHA-256 (10K) | 238095 | 2 | 7 | 36 | 4 | 8.64 | 39.23 | 10000 | 42 |
| Node SHA-512 (1K) | 250000 | 2 | 7 | 33 | 4 | 11.26 | 34.13 | 1000 | 4 |
| Node SHA-512 (10K) | 263158 | 2 | 3 | 30 | 3 | 11.17 | 32.9 | 10000 | 38 |
| Native scanPacket (1K) | 58824 | 5 | 13 | 82 | 17 | 9.1 | 40.17 | 1000 | 17 |
| Native scanPacket (10K) | 142857 | 4 | 9 | 34 | 7 | 13.42 | 40.94 | 10000 | 70 |
| Native scanBatch (1K) | 143 | 7536 | 7536 | 7536 | 7536 | 14.78 | 30.48 | 1 | 7 |
| Native scanBatch (10K) | 19 | 54828 | 54828 | 54828 | 54828 | 18.91 | 40.98 | 1 | 54 |
| Native scanBatch (100K) | 0 | 5359130 | 5359130 | 5359130 | 5359130 | 112.27 | 25.61 | 1 | 5359 |
| Native SHA-256 (1K) | 125 | 7378 | 7378 | 7378 | 7378 | 112.61 | 23.08 | 1 | 8 |
| Native SHA-256 (10K) | 16 | 63780 | 63780 | 63780 | 63780 | 115.89 | 26.06 | 1 | 64 |
| Native SHA-512 (1K) | 100 | 9973 | 9973 | 9973 | 9973 | 116.29 | 36.26 | 1 | 10 |
| Native SHA-512 (10K) | 9 | 108611 | 108611 | 108611 | 108611 | 105.7 | 25.67 | 1 | 108 |
| Native CRC-32 (1K) | 200 | 4452 | 4452 | 4452 | 4452 | 105.93 | 22.85 | 1 | 5 |
| Native CRC-32 (10K) | 26 | 38695 | 38695 | 38695 | 38695 | 108.15 | 25.06 | 1 | 39 |
| Burst Attack (50K batchScan 1K) | 206 | 4852 | 5822 | 7278 | 4852 | 145 | 0 | 50000 | 242596 |

## Notes

- Native benchmarks exercise the compiled C++ N-API addon (security_engine.node).
- Node.js crypto benchmarks use the built-in OpenSSL bindings.
- scanBatch results are measured per full batch invocation.
- CPU usage is per-core average across all logical CPUs.
- Memory is V8 heap used; native arena memory is tracked via engine metrics.
