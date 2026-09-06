# ARCHITECTURE.md - Discord Security Bot

**Version**: 2.0 (Post-Hardening)  
**Date**: 2026-09-05  

---

## System Overview

A production-grade Discord security and anti-nuke platform with defense-in-depth architecture.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        DISCORD PLATFORM                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────────┐  │
│  │   Gateway    │  │    REST      │  │   Audit Logs                │  │
│  │  (Events)    │  │   (Actions)  │  │   (Evidence)                │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┬──────────────┘  │
└─────────┼─────────────────┼──────────────────────────┼────────────────┘
          │                 │                          │
          ▼                 ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        BOT PROCESS (Single Process)                     │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    EVENT INGESTION LAYER                         │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌────────────────────────┐   │   │
│  │  │ Discord.js  │  │   Event     │  │   EnhancedEventEngine  │   │   │
│  │  │   Gateway   │──▶│ Normalization│──▶│   (Dedup + Intercept)  │   │   │
│  │  └─────────────┘  └─────────────┘  └───────────┬────────────┘   │   │
│  └─────────────────────────────────────────────────┼────────────────┘   │
│                                                    │                    │
│  ┌─────────────────────────────────────────────────┼────────────────┐   │
│  │              SECURITY PIPELINE (Hot Path)       │                │   │
│  │  ┌────────────┐  ┌────────────┐  ┌───────────┐  │                │   │
│  │  │  Actor/Perm│  │  Velocity  │  │   Risk    │  │                │   │
│  │  │ Resolution │▶│  Tracking  │▶│  Engine   │──┘                │   │
│  │  └────────────┘  └────────────┘  └───────────┘                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                    │                    │
│  ┌─────────────────────────────────────────────────┼────────────────┐   │
│  │              ACTION ENGINE                       │                │   │
│  │  ┌──────────┐  ┌────────────┐  ┌────────────┐  │                │   │
│  │  │  Policy  │  │ Idempotency│  │  Circuit   │  │                │   │
│  │  │ Decision │▶│   Manager  │▶│  Breaker   │──┘                │   │
│  │  └──────────┘  └────────────┘  └────────────┘                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                    │                    │
│  ┌─────────────────────────────────────────────────┼────────────────┐   │
│  │              EXECUTION LAYER                     │                │   │
│  │  ┌─────────────┐  ┌─────────────┐                │                │   │
│  │  │ Discord.js  │  │  Shutdown   │                │                │   │
│  │  │    REST     │  │   Drain     │                │                │   │
│  │  └─────────────┘  └─────────────┘                │                │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                    │                    │
│  ┌─────────────────────────────────────────────────┼────────────────┐   │
│  │              PERSISTENCE LAYER                   │                │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────┐  │                │   │
│  │  │   Redis     │  │   MongoDB   │  │  File   │  │                │   │
│  │  │  (Primary)  │  │  (Backup)   │  │  (Config)│  │                │   │
│  │  └─────────────┘  └─────────────┘  └─────────┘  │                │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              C++ NATIVE ENGINE (Worker Thread)                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌────────────────────────┐   │   │
│  │  │  SHA-256/   │  │  CRC32      │  │  Detection Rule Engine │   │   │
│  │  │  SHA-512    │  │  (SIMD)     │  │  (Batch Processing)    │   │   │
│  │  └─────────────┘  └─────────────┘  └────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Event Ingestion Layer

**Discord.js Gateway** - WebSocket connection to Discord
- Handles reconnection with exponential backoff
- Single connection (no sharding)

**Event Normalization** - Converts Discord events to internal format
- Strips unnecessary data
- Validates required fields

**EnhancedEventEngine** - Core anti-nuke engine
- **Deduplication**: 5-second window via `crossThreadSyncBus`
- **Audit Log Verification**: 10 retries × 300ms (with circuit breaker)
- **Self-Memory Check**: Prevents false positives on bot's own actions
- **Recursive Reversion**: Calls `revertAction` for unauthorized changes

### 2. Security Pipeline (Hot Path)

**Actor/Permission Resolution**
- Resolves executor identity from audit logs
- Checks owner/whitelist/Strict Owner hierarchy
- Verifies bot role hierarchy position

**Velocity Tracking**
- Per-user action timestamps in `userActionTimestamps` (TTL: 60s)
- Per-guild burst tracking in `guildBurstActions` (TTL: 60s)
- Panic burst tracking in `guildPanicBurstActions` (TTL: 60s)

**Risk Engine** (`SecurityPipeline`)
- Deterministic scoring: `risk = actorRisk + velocityRisk + permissionRisk + targetRisk + correlationRisk + historyRisk + incidentRisk`
- Normalized to 0-100 scale
- Thresholds: LOW(0-20), MEDIUM(21-50), HIGH(51-75), CRITICAL(76-100)

**Pipeline Integration** (`PipelineIntegration.ts`)
- **Production Wired**: All key Discord events (channelCreate, channelDelete, roleCreate, roleDelete, roleUpdate, channelUpdate, guildBanAdd, guildMemberRemove, messageCreate) are enqueued into `UltraLowLatencyPipeline` at the start of their handlers
- **Parallel Processing**: Pipeline runs in parallel with `EnhancedEventEngine.intercept()` for C++-accelerated risk scoring
- **C++ Engine**: Processes events through `CppNativeEngine` for SHA-256/CRC32 hashing and detection rule evaluation
- **ML/Predictive**: Events trigger `MLAnomalyDetector` and `PredictiveNukeDefense` asynchronously
- **Bounded Queues**: `MAX_QUEUE_SIZE=10000`, `MAX_CRITICAL_QUEUE=1000`, `MAX_HIGH_QUEUE=10000` with backpressure

### 3. Action Engine

**Policy Decision** (`EnhancedEventEngine.intercept`)
- Detection → Policy → Action (no direct coupling in new architecture)
- Actions: ALLOW, MONITOR, ALERT, RESTRICT, QUARANTINE, REVOKE, ISOLATE, RECOVER, ESCALATE

**Idempotency Manager** (`IdempotencyManager`)
- SHA-256 keys from (actionType, guildId, executorId, targetId)
- Promise-based waiting (no polling)
- 24-hour TTL, 10,000 max entries

**Circuit Breaker** (`DiscordRestCircuitBreaker`)
- States: CLOSED → OPEN → HALF_OPEN → CLOSED
- Ignores 4xx client errors
- 5 failures → OPEN, 3 successes in HALF_OPEN → CLOSED

### 4. Execution Layer

**Discord.js REST** - All API calls
- Wrapped with `withDiscordRest()` (circuit breaker + backoff + timeout + logging)
- 15s default timeout
- Priority queue for security-critical actions

**Shutdown Drain** (`waitForInFlightOperations`)
- Tracks in-flight promises via `trackOperation()`
- 10s default drain timeout
- Graceful SIGTERM/SIGINT handling

### 5. Persistence Layer

**Redis Persistence** (`RedisPersistence`)
- Primary: Upstash REST API or standard Redis TCP
- Fallback: In-memory with LRU eviction (10,000 entries)
- Circuit breaker on Redis operations

**MongoDB** (`MongoRedisEngine`) - Optional
- Backup storage
- Server snapshots

**File System** - Configuration & state
- `whitelist_data.json` - HMAC-signed (SHA-256, ADMIN_SECRET)
- `backups/` - Server snapshots
- `data/risk_score_history.json` - Risk metrics

### 6. C++ Native Engine (Worker Thread)

**Capabilities**
- SHA-256 / SHA-512 via OpenSSL EVP
- CRC32 with SIMD (SSE4.2) acceleration
- Batch processing (100K events max)
- Detection rule engine with configurable thresholds

**Performance**
- ~60,000 events/sec batch processing
- ~21 MB memory growth over 30s sustained load
- 16 MB memory arena

---

## Data Flow

### Normal Event Flow (Production Path - Pipeline Integrated)
```
Discord Gateway Event
    │
    ▼
EnhancedEventEngine.intercept()          UltraLowLatencyPipeline.enqueue()
    │                                          │
    ├──▶ Self-Memory Check (fast path)       ├──▶ Middleware (Rate Limiting)
    │                                          │
    ├──▶ Deduplication (crossThreadSyncBus)  ├──▶ C++ Engine (Risk Scoring)
    │                                          │
    ├──▶ Audit Log Fetch (with retry +       ├──▶ ML Anomaly Detection
    │     circuit breaker)                        │
    │                                          ├──▶ Predictive Nuke Defense
    ├──▶ Actor Resolution + Permission Check    │
    │                                          ├──▶ Event Handlers (ML, Predictive)
    ├──▶ Velocity Tracking (TtlMap)            │
    │                                          ▼
    ├──▶ Risk Scoring (SecurityPipeline)     Pipeline "processed" event
    │                                              │
    ├──▶ Policy Decision                       ▼
    │                                    Incident State Update
    ├──▶ Idempotency Check
    │
    ├──▶ Action Scheduling (Priority Queue)
    │
    ├──▶ Circuit Breaker Check
    │
    ├──▶ Discord REST Call (withDiscordRest)
    │
    ├──▶ Result Verification
    │
    └──▶ Incident State Update
```

### Pipeline-Only Fast Path (C++ Accelerated)
```
Discord Gateway Event
    │
    ▼
Pipeline.enqueue() → Middleware → C++ Engine → ML/Predictive Handlers → "processed" event
```

---

## Resource Budgets (Enforced)

| Resource | Limit | Enforcement |
|----------|-------|-------------|
| Total Queue | 10,000 events | Backpressure in `UltraLowLatencyPipeline.enqueue()` |
| Critical Queue | 1,000 events | Separate bound in pipeline |
| Max Concurrency | 8 workers | `navigator.hardwareConcurrency` |
| Decision Log | 500 entries | LRU eviction |
| Idempotency Keys | 10,000 entries | TTL: 24h, LRU |
| Rate Limit Cache | 10,000 entries | TTL: 24h |
| Audit Log Queue | 10,000 events | Batch: 100, Flush: 5s |
| C++ Memory Arena | 16 MB | Fixed allocation |
| TtlMap Default | 10,000 entries | Per-map config |

---

## Security Boundaries

```
TRUST BOUNDARIES:
┌─────────────────────────────────────────────────────────────────┐
│  UNTRUSTED: Discord Gateway Events, Audit Logs                 │
│  ─────────────────────────────────────────────────────────────  │
│  VALIDATED: Event Normalization, Schema Validation             │
│  ─────────────────────────────────────────────────────────────  │
│  SEMI-TRUSTED: Admin Dashboard, GitHub Webhooks                │
│  ─────────────────────────────────────────────────────────────  │
│  TRUSTED: Config (frozen at startup), C++ Engine               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Concurrency Model

| Component | Concurrency Strategy |
|-----------|---------------------|
| Discord Gateway | Single-threaded event loop |
| Event Processing | Priority queue with worker pool (max 8) |
| Redis Operations | Async with connection pooling |
| C++ Engine | Worker thread (offloaded) |
| Idempotency | Promise-based (no locks) |
| Rate Limiting | Atomic Redis ops / local fallback |
| Shutdown | Drain tracked promises |

---

## Failure Modes & Degradation

| Failure | Detection | Degradation |
|---------|-----------|-------------|
| Redis unavailable | Circuit breaker | In-memory fallback |
| Discord REST 429 | Rate limit header | Exponential backoff |
| Discord REST 5xx | Circuit breaker | Queue with retry |
| Audit log delay | Retry (10×300ms) | Continue without attribution |
| C++ Engine crash | Worker restart | JS fallback |
| Network partition | Timeout | Queue & drain |
| Memory pressure | GC + eviction | Drop low-priority |

---

## Configuration (Frozen at Startup)

```typescript
// SecurityConfig - Object.freeze()'d at initialization
{
  velocityThresholds: { ... },      // Event rate limits
  riskWeights: { ... },             // Scoring weights
  actionThresholds: { ... },        // Quarantine/Lockdown
  resourceBounds: { ... },          // Queue/Concurrency limits
  timeouts: { ... },                // All timeouts
  features: { ... }                 // Feature flags
}
```

---

## Observability

**Structured Logging** (Pino)
- Correlation IDs via `getRequestLogger(traceId)`
- Security events: `log.securityEvent()`
- Audit events: `log.auditEvent()`
- Performance: `log.perfEvent()`
- Failures: `log.securityFailure()`

**Metrics** (`UltraLowLatencyPipeline.getMetrics()`)
- `processed`, `failed`, `droppedEvents`
- Latency: avg, p50, p95, p99
- Throughput/sec
- Queue depth
- Backpressure events

**Circuit Breaker Metrics**
- State, failures, successes
- Next attempt time

---

## Deployment (Render Free Plan Optimized)

- Single Node.js process
- Single Discord gateway connection
- Reused Redis connection
- Bounded memory (<200 MB steady state)
- Event-driven (no polling)
- Graceful shutdown (10s drain)
- Health endpoint: `/api/health`