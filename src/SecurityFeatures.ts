// SecurityFeatures.ts - Backward Compatibility Layer
// This file re-exports all security modules from the new modular structure
// All new code should import directly from 'src/security/modules'

// Core utilities
export { atomicWriteJsonSync } from "./security/modules/utils.js";
export { TtlMap, LruMap } from "./security/MapManager.js";
export { withExponentialBackoff } from "./bot/utils.js";

// Authentication & Access Control
export { TokenVault, type TokenVaultConfig } from "./security/modules/token-vault.js";
export { OwnerLock, type OwnerLockConfig } from "./security/modules/owner-lock.js";
export { IPWhitelist, type IPWhitelistConfig } from "./security/modules/basic-filters.js";
export { DMFirewall, type DMFirewallConfig } from "./security/modules/basic-filters.js";
export { SlashOnly, type SlashOnlyConfig } from "./security/modules/basic-filters.js";

// Threat Detection
export { AntiPhishing, type AntiPhishingConfig } from "./security/modules/anti-phishing.js";
export { EnvScanner, type EnvScannerConfig } from "./security/modules/anti-phishing.js";
export { RateLimiter, type RateLimiterConfig } from "./security/modules/rate-limiter.js";
export { CanaryToken, type CanaryTokenConfig } from "./security/modules/canary-token.js";

// Defense Systems
export { NukeDefense, type NukeDefenseConfig } from "./security/modules/nuke-defense.js";
export { GlobalIntelligence, type GlobalIntelligenceConfig } from "./security/modules/global-intelligence.js";
export { WebhookGuard, type WebhookGuardConfig } from "./security/modules/webhook-guard.js";

// AI-Powered Security
export { AIDeepScan, type AIDeepScanConfig } from "./security/modules/ai-deep-scan.js";
export { SentimentTracker, type SentimentTrackerConfig } from "./security/modules/sentiment-tracker.js";
export { BehaviorScoring, type BehaviorScoringConfig } from "./security/modules/behavior-scoring.js";
export { AIRaidPrediction, type AIRaidPredictionConfig } from "./security/modules/ai-raid-prediction.js";
export { AISecurityReport, type AISecurityReportConfig } from "./security/modules/ai-security-report.js";
export { AICommandAssistant, type AICommandAssistantConfig } from "./security/modules/ai-command-assistant.js";

// Advanced Protection
export { Quarantine, type QuarantineConfig } from "./security/modules/quarantine.js";
export { TemporalRaidLock, type TemporalRaidLockConfig } from "./security/modules/temporal-raid-lock.js";
export { AntiVanityHijack, type AntiVanityHijackConfig } from "./security/modules/anti-vanity-hijack.js";
export { EmojiStickerProtection, type EmojiStickerProtectionConfig } from "./security/modules/emoji-sticker-protection.js";
export { ForumChannelProtection, type ForumChannelProtectionConfig } from "./security/modules/forum-channel-protection.js";

// IP & Access Management
export { IPBanSystem, type IPBanSystemConfig } from "./security/modules/ip-ban-system.js";
export { AdminWhitelistSystem, type AdminWhitelistSystemConfig } from "./security/modules/admin-whitelist.js";

// Backup & Recovery
export { AutoBackupEngine, type AutoBackupEngineConfig } from "./security/modules/auto-backup-engine.js";
export { DailyBackup, type DailyBackupConfig } from "./security/modules/daily-backup.js";
export { ServerSnapshotRestore, type ServerSnapshotRestoreConfig } from "./security/modules/server-snapshot-restore.js";

// Rate Limiting & Join Protection
export { JoinLimitShield, type JoinLimitShieldConfig } from "./security/modules/join-limit-shield.js";
export { AntiInviteShield, type AntiInviteShieldConfig } from "./security/modules/anti-invite-shield.js";
export { InviteTrackerEngine, type InviteTrackerEngineConfig } from "./security/modules/invite-tracker-engine.js";

// Audit & Monitoring
export { AuditLogMonitor, type AuditLogMonitorConfig } from "./security/modules/audit-log-monitor.js";
export { AnomalyAI, type AnomalyAIConfig } from "./security/modules/anomaly-ai.js";

// Auto-Healing & Permission Management
export { AutoHeal, type AutoHealConfig } from "./security/modules/auto-heal.js";
export { AutoPermissionRollback, type AutoPermissionRollbackConfig } from "./security/modules/auto-permission-rollback.js";

// Honeypot & Session Security
export { HoneypotAdminRole, type HoneypotAdminRoleConfig } from "./security/modules/honeypot-admin-role.js";
export { SessionHijackDetector, type SessionHijackDetectorConfig } from "./security/modules/session-hijack-detector.js";
export { OAuthMaliciousAppDetector, type OAuthMaliciousAppDetectorConfig } from "./security/modules/oauth-malicious-app-detector.js";

// Token & License Management
export { BotTokenRotationSystem, type BotTokenRotationSystemConfig } from "./security/modules/bot-token-rotation.js";
export { PremiumLicenseSystem, type PremiumLicenseSystemConfig } from "./security/modules/premium-license-system.js";

// Infrastructure
export { MongoRedisEngine } from "./security/modules/mongo-redis-engine.js";

// Legacy aliases for backward compatibility
export { NukeDefense as ZeroTrustSecurityEngine } from "./security/modules/nuke-defense.js";
export { AIRaidPrediction as AiRaidPredictionEngine } from "./security/modules/ai-raid-prediction.js";

// Type exports
export type { EncryptedTokenData } from "./security/modules/token-vault.js";
export type { RateLimitResult } from "./security/modules/rate-limiter.js";
export type { SignedTokenPayload, VerifiedTokenResult } from "./security/modules/canary-token.js";
export type { LockdownResult } from "./security/modules/nuke-defense.js";
export type { SentimentResult } from "./security/modules/sentiment-tracker.js";
export type { UserRiskData } from "./security/modules/behavior-scoring.js";
export type { RaidPredictionResult, HistoricalBaseline } from "./security/modules/ai-raid-prediction.js";
export type { LockStatus } from "./security/modules/temporal-raid-lock.js";
export type { VanityChangeRecord } from "./security/modules/anti-vanity-hijack.js";
export type { EmojiData, StickerData } from "./security/modules/emoji-sticker-protection.js";
export type { ForumTagData } from "./security/modules/forum-channel-protection.js";
export type { IPBanRecord, VerifiedIPRecord, BanResult, IPBanResult, UnbanResult } from "./security/modules/ip-ban-system.js";
export type { WhitelistRecord } from "./security/modules/admin-whitelist.js";
export type { ServerBackupData } from "./security/modules/auto-backup-engine.js";
export type { ServerSnapshotData } from "./security/modules/server-snapshot-restore.js";
export type { JoinStatus } from "./security/modules/join-limit-shield.js";
export type { UserInviteData, JoinResult, LeaveResult } from "./security/modules/invite-tracker-engine.js";
export type { AuditLogEntry } from "./security/modules/audit-log-monitor.js";
export type { AnomalyLevel } from "./security/modules/anomaly-ai.js";
export type { ChannelData, RoleData } from "./security/modules/auto-heal.js";
export type { SessionData } from "./security/modules/session-hijack-detector.js";
export type { ScanResult } from "./security/modules/oauth-malicious-app-detector.js";
export type { CacheStats, BackupResult } from "./security/modules/mongo-redis-engine.js";