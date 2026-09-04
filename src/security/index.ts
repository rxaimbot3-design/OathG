/**
 * Security module exports.
 *
 * This index re-exports from new modular implementations in ./modules/
 */

// Core interfaces and contexts
export type { BotContext, DefaultBotContext } from "../core";
export { botContext } from "../core";
export { GuildStateStore } from "../core";
export { GuildContext } from "../core";

export { type SecurityModule, type BotContext as IBotContext, type GuildContext as IGuildContext, type GuildStateStore as IGuildStateStore, type NukeDefenseModule, type AuditMonitorModule, type IPBanModule, type RateLimiterModule, type SentimentTrackerModule, type JoinLimitShieldModule, type InviteTrackerModule, type WebhookGuardModule, type AutoHealModule, type QuarantineModule, type TemporalRaidLockModule, type BehaviorScoringModule, type SessionHijackModule, type OAuthMaliciousAppModule, type AutoPermissionRollbackModule, type ServerSnapshotRestoreModule, type AntiVanityHijackModule, type EmojiStickerProtectionModule, type ForumChannelProtectionModule, type AIRaidPredictionModule, type HoneypotAdminRoleModule } from "../core";

// New modular implementations (from ./modules/)
export { AntiInviteShield, type AntiInviteShieldConfig } from "./modules/anti-invite-shield.js";
export { JoinLimitShield, type JoinLimitShieldConfig } from "./modules/join-limit-shield.js";
export { IPBanSystem, type IPBanRecord, type VerifiedIPRecord, type IPBanSystemConfig } from "./modules/ip-ban-system.js";
export { TokenVault, type TokenVaultConfig } from "./modules/token-vault.js";
export { NukeDefense, type NukeDefenseConfig } from "./modules/nuke-defense.js";
export { AuditLogMonitor, type AuditLogMonitorConfig } from "./modules/audit-log-monitor.js";
export { RateLimiter, type RateLimiterConfig } from "./modules/rate-limiter.js";
export { SentimentTracker, type SentimentTrackerConfig } from "./modules/sentiment-tracker.js";
export { WebhookGuard, type WebhookGuardConfig } from "./modules/webhook-guard.js";
export { AutoHeal, type AutoHealConfig } from "./modules/auto-heal.js";
export { Quarantine, type QuarantineConfig } from "./modules/quarantine.js";
export { TemporalRaidLock, type TemporalRaidLockConfig } from "./modules/temporal-raid-lock.js";
export { BehaviorScoring, type BehaviorScoringConfig } from "./modules/behavior-scoring.js";
export { SessionHijackDetector, type SessionHijackDetectorConfig } from "./modules/session-hijack-detector.js";
export { OAuthMaliciousAppDetector, type OAuthMaliciousAppDetectorConfig } from "./modules/oauth-malicious-app-detector.js";
export { AutoPermissionRollback, type AutoPermissionRollbackConfig } from "./modules/auto-permission-rollback.js";
export { ServerSnapshotRestore, type ServerSnapshotRestoreConfig } from "./modules/server-snapshot-restore.js";
export { AntiVanityHijack, type AntiVanityHijackConfig } from "./modules/anti-vanity-hijack.js";
export { EmojiStickerProtection, type EmojiStickerProtectionConfig } from "./modules/emoji-sticker-protection.js";
export { ForumChannelProtection, type ForumChannelProtectionConfig } from "./modules/forum-channel-protection.js";
export { AIRaidPrediction, type AIRaidPredictionConfig } from "./modules/ai-raid-prediction.js";
export { HoneypotAdminRole, type HoneypotAdminRoleConfig } from "./modules/honeypot-admin-role.js";
export { DailyBackup, type DailyBackupConfig } from "./modules/daily-backup.js";
export { AnomalyAI, type AnomalyAIConfig } from "./modules/anomaly-ai.js";
export { CanaryToken, type CanaryTokenConfig } from "./modules/canary-token.js";
export { GlobalIntelligence, type GlobalIntelligenceConfig } from "./modules/global-intelligence.js";
export { AIDeepScan, type AIDeepScanConfig } from "./modules/ai-deep-scan.js";
export { BotTokenRotationSystem, type BotTokenRotationSystemConfig } from "./modules/bot-token-rotation.js";
export { AutoBackupEngine, type AutoBackupEngineConfig } from "./modules/auto-backup-engine.js";
export { AISecurityReport, type AISecurityReportConfig } from "./modules/ai-security-report.js";
export { AICommandAssistant, type AICommandAssistantConfig } from "./modules/ai-command-assistant.js";
export { MongoRedisEngine } from "./modules/mongo-redis-engine.js";
export { PremiumLicenseSystem, type PremiumLicenseSystemConfig } from "./modules/premium-license-system.js";
export { InviteTrackerEngine, type InviteTrackerEngineConfig } from "./modules/invite-tracker-engine.js";
export { AdminWhitelistSystem, type AdminWhitelistSystemConfig, type WhitelistRecord } from "./modules/admin-whitelist.js";
export { atomicWriteJsonSync, checkUnboundedMapSize, runMemoryMonitoring, safeJsonParse, generateSecureRandom, timingSafeEqual } from "./modules/utils.js";
export { TtlMap, LruMap } from "./MapManager.js";

// Legacy aliases for backward compatibility
export { NukeDefense as ZeroTrustSecurityEngine } from "./modules/nuke-defense.js";
export { AIRaidPrediction as AiRaidPredictionEngine } from "./modules/ai-raid-prediction.js";

// Ultimate Security Systems (Next-Gen)
export { MLAnomalyDetector, mlAnomalyDetector, type AnomalyFeatures, type AnomalyResult, type BehavioralProfile } from "./MLAnomalyDetector.js";
export { PredictiveNukeDefense, predictiveNukeDefense, type ThreatPrediction, type NukeAttempt, type DefenseLayer } from "./PredictiveNukeDefense.js";
export { DistributedRateLimiter, distributedRateLimiter, type RateLimitConfig, type RateLimitResult, type DistributedRateLimitOptions } from "./DistributedRateLimiter.js";
