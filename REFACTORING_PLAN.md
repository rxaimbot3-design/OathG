# Refactoring Plan: Discord Security Bot

## Current State Analysis

### Problems Identified
1. **God Files**: `discord-bot.ts` (2500+ lines), `SecurityFeatures.ts` (2600+ lines), `server.ts` (1400+ lines)
2. **Global Mutable State**: 25+ top-level Maps/Sets/flags in discord-bot.ts
3. **No Configuration Abstraction**: Magic numbers hardcoded throughout
4. **Type Safety Gaps**: `any` types in audit log parsing, unsafe casts
5. **Memory Leaks**: Unbounded Maps without guild cleanup
6. **No Sharding Support**: Single Client instance assumption
7. **Dashboard Coupled**: React + Express + Bot in same process
8. **No Structured Logging**: console.log + custom array (max 100 entries)
9. **Sync I/O in Hot Paths**: fs.readFileSync/writeFileSync in security code

---

## Target Architecture

```
src/
├── config/
│   ├── index.ts              # Config loader with validation
│   ├── security.ts           # Security thresholds, tunable per-guild
│   ├── redis.ts              # Redis connection config
│   └── env.ts                # Environment validation
├── core/
│   ├── contexts/
│   │   ├── BotContext.ts     # ✅ Already exists
│   │   ├── GuildContext.ts   # ✅ Already exists
│   │   └── GuildStateStore.ts
│   ├── interfaces/
│   │   └── SecurityModule.ts # ✅ Already exists
│   ├── di/
│   │   └── Container.ts      # Dependency injection container
│   └── events/
│       └── EventBus.ts       # Decoupled event system
├── security/
│   ├── modules/              # Individual security modules (✅ mostly exist)
│   │   ├── token-vault.ts
│   │   ├── ip-ban-system.ts
│   │   ├── rate-limiter.ts
│   │   ├── nuke-defense.ts
│   │   ├── audit-log-monitor.ts
│   │   ├── sentiment-tracker.ts
│   │   ├── join-limit-shield.ts
│   │   ├── webhook-guard.ts
│   │   ├── auto-heal.ts
│   │   ├── quarantine.ts
│   │   ├── temporal-raid-lock.ts
│   │   ├── behavior-scoring.ts
│   │   ├── session-hijack-detector.ts
│   │   ├── oauth-malicious-app-detector.ts
│   │   ├── auto-permission-rollback.ts
│   │   ├── server-snapshot-restore.ts
│   │   ├── anti-vanity-hijack.ts
│   │   ├── emoji-sticker-protection.ts
│   │   ├── forum-channel-protection.ts
│   │   ├── ai-raid-prediction.ts
│   │   ├── honeypot-admin-role.ts
│   │   ├── anti-invite-shield.ts
│   │   ├── backup-engine.ts
│   │   └── anomaly-ai.ts
│   ├── Pipeline.ts           # Security pipeline orchestrator
│   ├── MapManager.ts         # TTL/LRU Map implementations
│   └── index.ts              # Barrel exports
├── bot/
│   ├── events/
│   │   ├── guild-events.ts   # guildCreate, guildDelete, etc.
│   │   ├── message-events.ts # messageCreate, messageDelete, etc.
│   │   ├── member-events.ts  # guildMemberAdd, guildMemberRemove, etc.
│   │   ├── channel-events.ts # channelCreate, channelDelete, etc.
│   │   ├── role-events.ts    # roleCreate, roleDelete, etc.
│   │   ├── audit-log-events.ts # audit log processing
│   │   └── index.ts
│   ├── commands/
│   │   ├── slash-commands.ts # Slash command definitions
│   │   ├── prefix-commands.ts # Prefix command handling
│   │   ├── admin-commands.ts # Admin-only commands
│   │   ├── security-commands.ts # Security-related commands
│   │   └── index.ts
│   ├── utils/
│   │   ├── helpers.ts        # ✅ Already exists (bot/utils.ts)
│   │   ├── permissions.ts    # Permission checking utilities
│   │   ├── embeds.ts         # Embed builders
│   │   └── discord-api.ts    # Discord API helpers with retry
│   ├── services/
│   │   ├── DiscordBot.ts     # Main bot class (DI-friendly)
│   │   ├── ShardManager.ts   # Sharding support
│   │   ├── StateManager.ts   # Encapsulated global state
│   │   ├── Logger.ts         # Structured logging (Pino)
│   │   └── Metrics.ts        # Prometheus metrics
│   └── index.ts
├── dashboard/                # Separate service (future)
│   ├── server/
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── index.ts
│   └── client/               # React app
├── shared/
│   ├── types.ts              # Shared TypeScript types
│   ├── constants.ts          # Magic numbers as constants
│   └── errors.ts             # Custom error classes
└── main.ts                   # Application entry point
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
1. ✅ Create `config/security.ts` - Centralized security configuration
2. ✅ Create `shared/constants.ts` - Replace all magic numbers
3. ✅ Create `shared/errors.ts` - Custom error classes
4. ✅ Create `core/di/Container.ts` - Simple DI container
5. ✅ Create `bot/services/Logger.ts` - Pino structured logging
5. ✅ Create `bot/services/StateManager.ts` - Encapsulate global state
6. ✅ Create `bot/services/Metrics.ts` - Prometheus metrics

### Phase 2: Security Module Migration (Week 1-2)
1. ✅ Migrate legacy classes from `SecurityFeatures.ts` to `src/security/modules/`
2. ✅ Each module implements `SecurityModule` interface
3. ✅ Remove static state, use instance state + DI
4. ✅ Add proper TypeScript types (no `any`)
5. ✅ Add unit tests for each module

### Phase 3: Discord Bot Refactoring (Week 2)
1. ✅ Split `discord-bot.ts` into event handlers
2. ✅ Create `DiscordBot` class with DI
3. ✅ Add `ShardManager` for sharding support
4. ✅ Register event handlers via EventBus
5. ✅ Slash/prefix commands as separate modules
6. ✅ Fix audit log parsing types

### Phase 4: Server/API Refactoring (Week 2-3)
1. ✅ Split `server.ts` into route modules
2. ✅ Separate dashboard into standalone service
3. ✅ Add OpenAPI/Swagger docs
4. ✅ Add authentication middleware as separate module

### Phase 5: Infrastructure (Week 3)
1. ✅ Multi-stage Dockerfile
2. ✅ Docker Compose for local dev
3. ✅ Health checks, graceful shutdown
4. ✅ CI/CD pipeline updates

### Phase 6: Testing & Validation (Week 3-4)
1. ✅ Run full test suite
2. ✅ Load testing
3. ✅ Integration testing
4. ✅ Security audit

---

## Key Design Decisions

### Dependency Injection
```typescript
// Container registers all services
container.register('config', SecurityConfig);
container.register('logger', Logger);
container.register('stateManager', StateManager);
container.register('tokenVault', TokenVault);
container.register('ipBanSystem', IPBanSystem);
// ... modules registered per-guild via GuildContext
```

### Configuration System
```typescript
// config/security.ts
export const securityConfig = {
  velocityThresholds: {
    userActionsPer5s: 6,
    guildActionsPer5s: 12,
    guildPanicActionsPer3s: 10,
    sequentialKickBanPer15s: 5,
    whitelistedAdminActionsPer10s: 8,
  },
  timeWindows: {
    velocityWindowMs: 5000,
    panicWindowMs: 3000,
    sequentialWindowMs: 15000,
    whitelistWindowMs: 10000,
    quarantineWindowMs: 60000,
    lockdownAutoResetMs: 600000,
  },
  // Per-guild overrides via database
  guildOverrides: new Map<string, Partial<SecurityConfig>>(),
};
```

### State Management
```typescript
// bot/services/StateManager.ts
export class StateManager {
  private userActionTimestamps = new TtlMap<string, number[]>({ ttlMs: 5000 });
  private guildBurstActions = new TtlMap<string, number[]>({ ttlMs: 5000 });
  private guildPanicBurstActions = new TtlMap<string, number[]>({ ttlMs: 3000 });
  private sequentialKickBanTracker = new TtlMap<string, number[]>({ ttlMs: 15000 });
  private whitelistActionTimestamps = new TtlMap<string, number[]>({ ttlMs: 10000 });
  private userSpamTracker = new TtlMap<string, number[]>({ ttlMs: 60000 });
  private userViolations = new TtlMap<string, { count: number; timestamp: number }>({ ttlMs: 3600000 });
  private globalBanActions = new TtlMap<string, BanAction[]>({ ttlMs: 1800000 });
  private globalJoinHistory = new TtlMap<string, number[]>({ ttlMs: 1800000 });
  private globalLeaveHistory = new TtlMap<string, number[]>({ ttlMs: 1800000 });
  private recentWhitelistedActions = new TtlMap<string, WhitelistedAction[]>({ ttlMs: 30000 });
  // ... all state encapsulated, auto-cleanup via TTL
}
```

### Sharding Support
```typescript
// bot/services/ShardManager.ts
export class ShardManager {
  private shards: Map<number, Client> = new Map();
  private totalShards: number;
  
  async spawn(shardId: number): Promise<Client> { ... }
  async reshard(): Promise<void> { ... }
  broadcast(payload: any): void { ... }
  broadcastEval(script: string): Promise<any[]> { ... }
}
```

---

## Migration Strategy

### Backward Compatibility
- Keep `SecurityFeatures.ts` as legacy re-exports during transition
- Use `src/security/index.ts` as migration bridge
- Gradually update imports in `discord-bot.ts` and `server.ts`

### Testing Approach
- Each module has unit tests in `tests/security/`
- Integration tests in `tests/integration/`
- E2E tests in `tests/e2e/`
- Run `npm run test:all` after each phase

### Rollback Plan
- Git tags for each phase
- Feature flags for new modules
- Canary deployment for sharding

---

## File Changes Summary

### New Files to Create
| File | Purpose |
|------|---------|
| `src/config/security.ts` | Centralized security config |
| `src/config/index.ts` | Config loader |
| `src/shared/constants.ts` | Magic numbers |
| `src/shared/errors.ts` | Custom errors |
| `src/core/di/Container.ts` | DI container |
| `src/core/events/EventBus.ts` | Event system |
| `src/bot/services/Logger.ts` | Pino logger |
| `src/bot/services/StateManager.ts` | Encapsulated state |
| `src/bot/services/Metrics.ts` | Prometheus metrics |
| `src/bot/services/ShardManager.ts` | Sharding |
| `src/bot/services/DiscordBot.ts` | Main bot class |
| `src/bot/events/*.ts` | Event handlers (6 files) |
| `src/bot/commands/*.ts` | Command modules (4 files) |

### Files to Refactor
| File | Action |
|------|--------|
| `discord-bot.ts` | Split into 10+ modules |
| `SecurityFeatures.ts` | Migrate 35+ classes to modules |
| `server.ts` | Split into route modules |
| `src/bot/utils.ts` | Split into focused utilities |

### Files to Delete (after migration)
| File | Reason |
|------|--------|
| `SecurityFeatures.ts` | Replaced by modular security/ |
| `discord-bot.ts` | Replaced by bot/ structure |

---

## Success Criteria

- [ ] All magic numbers moved to `config/security.ts`
- [ ] Zero `any` types in security-critical code
- [ ] No global mutable state (all encapsulated in StateManager)
- [ ] All security modules implement `SecurityModule` interface
- [ ] Sharding works (tested with 2+ shards)
- [ ] Dashboard runs as separate service
- [ ] Structured JSON logs + Prometheus metrics
- [ ] All existing tests pass
- [ ] Memory stable under 24h load test
- [ ] Docker image < 500MB (multi-stage)
- [ ] Cold start < 10s