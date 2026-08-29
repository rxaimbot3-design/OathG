/**
 * Security module exports.
 *
 * This index re-exports from both legacy (SecurityFeatures.ts) and
 * new modular implementations. Over time, classes will migrate here.
 */

// Core interfaces and contexts
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
export { TokenVault, TokenVaultInstance, type VaultEntry } from "./token-vault";
export { NukeDefense, NukeDefenseInstance } from "./nuke-defense";
export { AuditLogMonitor, AuditLogMonitorInstance, type AuditAction } from "./audit-log-monitor";
export { RateLimiter, RateLimiterInstance } from "./rate-limiter";
export { SentimentTracker, SentimentTrackerInstance } from "./sentiment-tracker";
export { WebhookGuard, WebhookGuardInstance } from "./webhook-guard";
export { AutoHeal, AutoHealInstance, type ChannelData, type RoleData } from "./auto-heal";
export { Quarantine, QuarantineInstance } from "./quarantine";
export { TemporalRaidLock, TemporalRaidLockInstance } from "./temporal-raid-lock";
export { BehaviorScoring, BehaviorScoringInstance, type RiskEntry } from "./behavior-scoring";
export { SessionHijackDetector, SessionHijackDetectorInstance, type SessionInfo } from "./session-hijack-detector";
export { OAuthMaliciousAppDetector, OAuthMaliciousAppDetectorInstance } from "./oauth-malicious-app-detector";
export { AutoPermissionRollback, AutoPermissionRollbackInstance, type PermissionChange } from "./auto-permission-rollback";
export { ServerSnapshotRestore, ServerSnapshotRestoreInstance, type ServerSnapshotData } from "./server-snapshot-restore";
export { AntiVanityHijack, AntiVanityHijackInstance, type VanityChange } from "./anti-vanity-hijack";
export { EmojiStickerProtection, EmojiStickerProtectionInstance } from "./emoji-sticker-protection";
export { ForumChannelProtection, ForumChannelProtectionInstance } from "./forum-channel-protection";
export { AIRaidPrediction, AIRaidPredictionInstance, type RaidRiskPrediction } from "./ai-raid-prediction";
export { HoneypotAdminRole, HoneypotAdminRoleInstance } from "./honeypot-admin-role";

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
