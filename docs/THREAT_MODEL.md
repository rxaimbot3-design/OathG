# THREAT MODEL - Discord Security Bot

**Version**: 1.0  
**Date**: 2026-09-05  
**Status**: DRAFT - Under Review  

---

## 1. ASSETS

### 1.1 Primary Assets (What We Protect)

| Asset | Description | Classification | Impact if Compromised |
|-------|-------------|----------------|----------------------|
| Discord Bot Token | Authentication token for Discord Gateway/REST | **CRITICAL** | Full bot impersonation, server access, message reading, admin actions |
| Admin Secret (ADMIN_SECRET) | Master key for session encryption, config signing | **CRITICAL** | Session hijacking, config tampering, vault decryption |
| Guild Configurations | Channel/role permissions, verification settings | **HIGH** | Security bypass, privilege escalation |
| IP Ban Database | User ID ↔ IP mappings, ban records | **HIGH** | Ban evasion, doxxing risk |
| Audit Logs | Security event history, attacker attribution | **HIGH** | Forensic loss, compliance violation |
| Session Tokens | Admin dashboard authentication | **HIGH** | Dashboard takeover, config theft |
| Encrypted Token Vault | Stored secrets (Discord token, API keys) | **CRITICAL** | Full credential compromise |

### 1.2 Secondary Assets

| Asset | Description | Classification |
|-------|-------------|----------------|
| Invite Tracking Data | Inviter/joiner relationships | MEDIUM |
| Sentiment/Behavior Profiles | User risk scores | MEDIUM |
| Server Snapshots | Channel/role backups | MEDIUM |
| Webhook URLs | Notification endpoints | LOW |

---

## 2. THREAT ACTORS

| Actor | Capability | Motivation | Likelihood |
|-------|------------|------------|------------|
| **External Attacker** | Network access, Discord account, bot token theft | Server disruption, data theft, vandalism | HIGH |
| **Compromised Admin** | Valid Discord permissions (Admin/Manage Guild) | Malicious insider, hijacked account | HIGH |
| **Compromised Owner** | Full Discord permissions (Owner) | Token theft, session hijack | MEDIUM |
| **Malicious Bot** | Invited to server, has bot token | Mass DM, spam, raid coordination | MEDIUM |
| **Raid Group** | Coordinated accounts, automation | Mass join/kick/ban/channel delete | HIGH |
| **Supply Chain** | Compromised npm package, dependency | Code execution, data exfiltration | LOW |
| **Insider (Dev)** | Source code access, CI/CD | Backdoor injection | LOW |

### Special Case: Attacker with Valid Privileged Discord Credentials
> **Fundamental Limitation**: A bot cannot override Discord's server-side authorization. If an attacker possesses valid credentials with equal or greater authority than the bot, the bot cannot magically deny that credential at the Discord API authorization layer.

**Mitigation Focus**: Least privilege, role hierarchy enforcement, credential protection, detection, containment, rapid response, recovery, verification, incident visibility.

---

## 3. ATTACK SURFACES

### 3.1 Network Boundaries

| Surface | Protocol | Exposure | Auth |
|---------|----------|----------|------|
| Discord Gateway | WebSocket (WSS) | Internet | Bot Token |
| Discord REST API | HTTPS | Internet | Bot Token |
| Admin Dashboard | HTTPS | Internet (configurable) | Session Token / ADMIN_SECRET |
| GitHub Webhook | HTTPS | Internet | HMAC Secret |
| Redis (Upstash/TCP) | Redis/HTTP | Internal/Internet | Password/Token |
| MongoDB | MongoDB Wire | Internal | Credentials |

### 3.2 Code Boundaries (Entry Points)

| Entry Point | File | Input Source | Validation |
|-------------|------|--------------|------------|
| Discord Events | `discord-bot.ts` | Gateway/REST | Partial (trusts Discord) |
| Slash Commands | `discord-bot.ts` | Interactions | `checkCommandPermission()` |
| Prefix Commands | `discord-bot.ts` | Messages | Basic checks |
| HTTP API | `server.ts` | Express routes | `requireAdminAuth()` |
| GitHub Webhook | `server.ts` | HTTP POST | HMAC verification |
| Honeypot Trap | `server.ts` | HTTP GET | IP logging only |

---

## 4. TRUST BOUNDARIES

```
┌─────────────────────────────────────────────────────────────┐
│                    DISCORD PLATFORM                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Gateway   │  │    REST     │  │   Audit Logs        │  │
│  │  (Events)   │  │   (Actions) │  │   (Evidence)        │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
└─────────┼────────────────┼─────────────────────┼─────────────┘
          │                │                     │
          ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                      BOT PROCESS                            │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐  │
│  │ Event        │ │ Security     │ │ Action             │  │
│  │ Ingestion    │ │ Pipeline     │ │ Engine             │  │
│  └──────┬───────┘ └──────┬───────┘ └─────────┬──────────┘  │
│         │                │                    │             │
│         ▼                ▼                    ▼             │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐  │
│  │ Discord.js   │ │ C++ Engine   │ │ Redis/Mongo        │  │
│  │ Cache/State  │ │ (N-API)      │ │ Persistence        │  │
│  └──────────────┘ └──────────────┘ └────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
          │                │                    │
          ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                      EXTERNAL                                │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐  │
│  │ Admin        │ │ GitHub       │ │ Honeypot           │  │
│  │ Dashboard    │ │ Webhooks     │ │ Visitors           │  │
│  └──────────────┘ └──────────────┘ └────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Trust Assumptions (EXPLICIT)

| Boundary | Trust Level | Assumption | Verification |
|----------|-------------|------------|--------------|
| Discord → Bot | **UNTRUSTED INPUT** | Events may be duplicated, delayed, out-of-order, spoofed | Deduplication, timestamp validation, audit log verification |
| Bot → Discord REST | **TRUSTED ACTION** | Bot token is valid, rate limits respected | Retry with backoff, idempotency keys |
| Admin → Dashboard | **PARTIALLY TRUSTED** | Session token valid, IP bound, replay protected | Token validation, IP binding, rate limiting |
| Redis → Bot | **UNRELIABLE DEPENDENCY** | May be slow, unavailable, return stale data | Circuit breaker, local fallback, TTL validation |
| C++ Engine → Bot | **TRUSTED COMPUTE** | Native code memory-safe, no side effects | Input bounds checking, sandboxed |
| Config/Env → Bot | **TRUSTED AT STARTUP** | Validated on boot, immutable after | `validateEnvironmentVariables()` |

---

## 5. SECURITY ASSUMPTIONS

| # | Assumption | Risk if Wrong | Mitigation |
|---|------------|---------------|------------|
| 1 | Discord delivers events in causal order | Race conditions, missed correlations | Bounded reorder window, idempotent processing |
| 2 | Audit logs are accurate and timely | False positives/negatives in detection | Retry with backoff, multiple fetch attempts |
| 3 | Bot role is above all managed roles | Cannot moderate higher/equal roles | Startup verification, alert on hierarchy violation |
| 4 | ADMIN_SECRET never leaks | Full system compromise | Env-only, never logged, encrypted config |
| 5 | Redis data is not maliciously corrupted | Wrong rate limits, false bans | Local cache validation, TTL checks |
| 6 | C++ native addon is memory-safe | RCE via crafted input | Bounds checking, fuzz testing |
| 7 | Single bot process (no sharding conflicts) | Duplicate actions, state divergence | Single-process design, leader election if scaled |

---

## 6. ATTACK PATHS & MITIGATIONS

### 6.1 Anti-Nuke Bypass Attempts

| Attack Path | Description | Current Mitigation | Gap |
|-------------|-------------|-------------------|-----|
| **Compromised Admin Token** | Attacker uses stolen admin token to perform destructive actions | Zero Trust: Owner/Whitelist only, velocity limits, audit log verification | Owner compromise = lockdown only |
| **Audit Log Delay** | Discord delays audit log entry, bot misses attribution | `fetchAuditLogWithRetry` (10 retries, 300ms delay) | Retry storm under load |
| **Event Duplication** | Discord sends same event twice, double punishment | `EnhancedEventEngine.crossThreadSyncBus` (5s dedup) | Memory bounded? |
| **Out-of-Order Events** | Delete arrives before create, bot can't revert | Timestamp-based, idempotent revert | Not fully tested |
| **Role Hierarchy** | Bot role below admin role, cannot ban/strip | Startup check, alert, channel permission overwrite fallback | Fallback may not cover all actions |

### 6.2 Injection Attacks

| Vector | Location | Current Mitigation | Gap |
|--------|----------|-------------------|-----|
| **Command Injection** | `discord-bot.ts` slash/prefix commands | `validateInput()`, `sanitizeInput()` | Not all paths validated |
| **Path Traversal** | Backup/restore file ops | `path.join()`, `atomicWriteJsonSync` | Restore uses user-controlled `dumpFile` |
| **Prototype Pollution** | JSON parsing in config | `JSON.parse()` only | No `Object.freeze()` on config |
| **Regex DoS** | `linkRegex`, `nsfwScamRegex` | Simple patterns | Not tested for catastrophic backtracking |

### 6.3 Resource Exhaustion

| Vector | Target | Current Mitigation | Gap |
|--------|--------|-------------------|-----|
| **Event Flood** | Event loop, memory | `TtlMap` with `maxEntries` | Some maps unbounded (e.g., `botLogs`) |
| **Unique Key Flood** | `TtlMap` memory | `maxEntries` + FIFO eviction | Eviction may lose security state |
| **Queue Saturation** | `UltraLowLatencyPipeline` queues | `maxWorkers` limit | Unbounded queues (arrays) |
| **Timer Leaks** | `setInterval`/`setTimeout` | `activeIntervals` tracking | Multiple cleanup intervals |
| **Listener Leaks** | Discord.js event listeners | Register once in `ready` | Reconnect may re-register |
| **Log Flood** | Disk/RAM | `botLogs` capped at 100 | Audit logs unbounded in memory |

### 6.4 Privilege Escalation

| Path | Description | Current Mitigation | Gap |
|------|-------------|-------------------|-----|
| **Webhook Abuse** | Non-owner creates webhook for exfil | Strict Owner-only policy, auto-delete | Only enforced on create/update/delete events |
| **Bot Addition** | Unauthorized bot added | Whitelist check, auto-kick | Audit log delay |
| **Role Escalation** | Admin role given to user | `roleUpdate`/`guildMemberUpdate` revert | Permission check only on dangerous perms |
| **Permission Overwrite** | Channel perms modified | `channelUpdate` revert | May miss overwrite create/delete |

### 6.5 Persistence & Recovery Attacks

| Attack | Target | Current Mitigation | Gap |
|--------|--------|-------------------|-----|
| **Backup Tampering** | `backups/` directory | HMAC on whitelist only | Snapshots not signed |
| **Config Tampering** | `whitelist_data.json` | HMAC-SHA256 with ADMIN_SECRET | Other configs not protected |
| **Session Hijacking** | Admin dashboard | IP binding, replay protection | Token in localStorage (XSS risk) |
| **State Desync** | Redis vs memory | Local fallback, Redis authoritative | Split-brain possible |

---

## 7. MITIGATIONS SUMMARY

### 7.1 Defense in Depth Layers

| Layer | Components | Status |
|-------|------------|--------|
| **Input Validation** | `validateInput`, `sanitizeInput`, regex filters | ⚠️ Partial |
| **Identity Verification** | Owner/Whitelist/Strict Owner checks | ✅ Implemented |
| **Authorization** | Role hierarchy, permission checks | ⚠️ Startup only |
| **Behavior Analysis** | Velocity tracking, burst detection | ✅ Implemented |
| **Event Correlation** | `EnhancedEventEngine`, `crossThreadSyncBus` | ⚠️ Untested |
| **Rate Limiting** | Per-user, per-guild, per-action, global | ⚠️ In-memory fallback |
| **Risk Scoring** | `SecurityPipeline`, C++ engine | ✅ Implemented |
| **Policy Engine** | `NukeDefense`, `EnhancedEventEngine` | ⚠️ Detection=Action coupled |
| **Action Verification** | Post-action state check | ⚠️ Limited |
| **Recovery** | `ServerSnapshotRestore`, `AutoBackupEngine` | ⚠️ Untested restore |

### 7.2 Critical Gaps (PRIORITY)

| Gap | Severity | Evidence |
|-----|----------|----------|
| Detection coupled to Action | **HIGH** | `EnhancedEventEngine.intercept()` calls `punishRogueAdmin()` directly |
| No idempotency keys for REST actions | **HIGH** | Duplicate events → duplicate bans/kicks |
| Unbounded queues in `UltraLowLatencyPipeline` | **HIGH** | Arrays grow without limit |
| Audit log retry storm under load | **MEDIUM** | 10 retries × 300ms = 3s per event |
| No circuit breaker for Discord REST | **MEDIUM** | 429/5xx → infinite retry potential |
| Config not immutable after startup | **MEDIUM** | `ownerWhitelist` modified at runtime |
| No structured logging / correlation IDs | **MEDIUM** | Debugging production incidents difficult |
| C++ engine fallback not benchmarked | **MEDIUM** | JS fallback path unmeasured |

---

## 8. RESIDUAL RISKS (ACCEPTED)

| Risk | Likelihood | Impact | Acceptance Rationale |
|------|------------|--------|---------------------|
| Owner account compromise → server lockdown only | MEDIUM | HIGH | Fundamental Discord limitation; cannot override Owner |
| Discord API rate limit → action delay/loss | HIGH | MEDIUM | Inherent to platform; best-effort with backoff |
| Network partition → split-brain (Redis) | LOW | HIGH | Single-process design minimizes |
| Zero-day in Discord.js / Node.js | LOW | CRITICAL | Dependency scanning, minimal deps |
| Insider threat (dev with prod access) | LOW | CRITICAL | Code review, CI/CD separation |

---

## 9. TESTING REQUIREMENTS (Derived from Threat Model)

| Test Category | Required Coverage | Current Status |
|---------------|-------------------|----------------|
| **Duplicate Events** | Same event ID processed twice → single action | ❌ Missing |
| **Out-of-Order Events** | Delete before create, ban before kick | ❌ Missing |
| **Replay Attacks** | Old audit log entry re-processed | ❌ Missing |
| **Queue Saturation** | 10k+ events → backpressure behavior | ❌ Missing |
| **Redis Failure** | Degraded mode, local fallback | ❌ Missing |
| **Redis Timeout** | Slow Redis → circuit breaker | ❌ Missing |
| **REST 429** | Rate limit handling, priority queue | ❌ Missing |
| **REST Timeout** | Request timeout, retry logic | ❌ Missing |
| **Reconnect** | Listener re-registration, state recovery | ❌ Missing |
| **Worker Crash** | EngineWorker failure → fallback | ❌ Missing |
| **Shutdown Race** | SIGTERM during action → consistency | ❌ Missing |
| **Memory Bounds** | Post-burst stabilization | ⚠️ Partial |

---

## 10. VERIFICATION PLAN

For each attack path, create:
1. **Reproduction test** - Deterministic failure case
2. **Regression test** - Added to CI suite
3. **Fix** - Minimal, targeted change
4. **Benchmark** - Latency/throughput impact measured
5. **Documentation** - Update threat model with evidence

---

## 11. CHANGE LOG

| Date | Version | Changes |
|------|---------|---------|
| 2026-09-05 | 1.0 | Initial threat model from code audit |

---

*This threat model must be updated with each security-relevant change. All mitigations require regression tests.*