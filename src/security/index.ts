/**
 * Security module exports.
 *
 * This index re-exports from both legacy (SecurityFeatures.ts) and
 * new modular implementations. Over time, classes will migrate here.
 */

// Core interfaces
export {
  BotContext,
  DefaultBotContext,
  botContext,
  GuildStateStore,
  GuildContext,
} from "../core";

export type {
  SecurityModule,
  BotContext as IBotContext,
  GuildContext as IGuildContext,
  GuildStateStore as IGuildStateStore,
  NukeDefenseModule,
  AuditMonitorModule,
  IPBanModule,
  RateLimiterModule,
  SentimentTrackerModule,
  JoinLimitShieldModule,
  InviteTrackerModule,
  WebhookGuardModule,
  AutoHealModule,
  QuarantineModule,
  TemporalRaidLockModule,
  BehaviorScoringModule,
  SessionHijackModule,
  OAuthMaliciousAppModule,
  AutoPermissionRollbackModule,
  ServerSnapshotRestoreModule,
  AntiVanityHijackModule,
  EmojiStickerProtectionModule,
  ForumChannelProtectionModule,
  AIRaidPredictionModule,
  HoneypotAdminRoleModule,
} from "../core";

// New modular implementations
export { AntiInviteShield, AntiInviteShieldInstance } from "./anti-invite-shield";
export { JoinLimitShield, JoinLimitShieldInstance } from "./join-limit-shield";
export { IPBanSystem, IPBanSystemInstance, type IPBanRecord, type VerifiedIPRecord } from "./ip-ban-system";

// Legacy re-exports (to be gradually replaced)
export {
  TokenVault,
  OwnerLock,
  IPWhitelist,
  EnvScanner,
  DMFirewall,
  SlashOnly,
  AntiPhishing,
  RateLimiter,
  AuditLogMonitor,
  DailyBackup,
  AnomalyAI,
  CanaryToken,
  NukeDefense,
  GlobalIntelligence,
  WebhookGuard,
  AutoHeal,
  AIDeepScan,
  Quarantine,
  TemporalRaidLock,
  SentimentTracker,
  BehaviorScoring,
  HoneypotAdminRole,
  SessionHijackDetector,
  OAuthMaliciousAppDetector,
  BotTokenRotationSystem,
  AutoPermissionRollback,
  ServerSnapshotRestore,
  AutoBackupEngine,
  AntiVanityHijack,
  EmojiStickerProtection,
  ForumChannelProtection,
  AIRaidPrediction,
  AISecurityReport,
  AICommandAssistant,
  MongoRedisEngine,
  PremiumLicenseSystem,
  InviteTrackerEngine,
  ZeroTrustSecurityEngine,
  AiRaidPredictionEngine,
  atomicWriteJsonSync,
  AdminWhitelistSystem,
  type WhitelistRecord,
  type ServerSnapshotData,
} from "../SecurityFeatures";
