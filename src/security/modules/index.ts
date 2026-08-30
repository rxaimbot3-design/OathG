// Security Modules - Main Export
// All security modules are now split into individual files for better maintainability

// Core utilities
export { atomicWriteJsonSync, checkUnboundedMapSize, runMemoryMonitoring, safeJsonParse, generateSecureRandom, timingSafeEqual } from "./utils.js";
export { TtlMap, LruMap } from "../MapManager.js";

// Authentication & Access Control
export { TokenVault, type TokenVaultConfig, type EncryptedTokenData } from "./token-vault.js";
export { OwnerLock, type OwnerLockConfig } from "./owner-lock.js";
export { IPWhitelist, type IPWhitelistConfig } from "./basic-filters.js";
export { DMFirewall, type DMFirewallConfig } from "./basic-filters.js";
export { SlashOnly, type SlashOnlyConfig } from "./basic-filters.js";

// Threat Detection
export { AntiPhishing, type AntiPhishingConfig } from "./anti-phishing.js";
export { EnvScanner, type EnvScannerConfig } from "./anti-phishing.js";
export { RateLimiter, type RateLimiterConfig, type RateLimitResult } from "./rate-limiter.js";
export { CanaryToken, type CanaryTokenConfig, type SignedTokenPayload, type VerifiedTokenResult } from "./canary-token.js";

// Defense Systems
export { NukeDefense, type NukeDefenseConfig, type LockdownResult } from "./nuke-defense.js";
export { GlobalIntelligence, type GlobalIntelligenceConfig } from "./global-intelligence.js";
export { WebhookGuard, type WebhookGuardConfig } from "./webhook-guard.js";

// AI-Powered Security
export { AIDeepScan, type AIDeepScanConfig } from "./ai-deep-scan.js";
export { SentimentTracker, type SentimentTrackerConfig, type SentimentResult } from "./sentiment-tracker.js";
export { BehaviorScoring, type BehaviorScoringConfig, type UserRiskData } from "./behavior-scoring.js";
export { AIRaidPrediction, type AIRaidPredictionConfig, type RaidPredictionResult, type HistoricalBaseline } from "./ai-raid-prediction.js";
export { AISecurityReport, type AISecurityReportConfig } from "./ai-security-report.js";
export { AICommandAssistant, type AICommandAssistantConfig, type ConfigOptimizationResult } from "./ai-command-assistant.js";

// Advanced Protection
export { Quarantine, type QuarantineConfig } from "./quarantine.js";
export { TemporalRaidLock, type TemporalRaidLockConfig, type LockStatus } from "./temporal-raid-lock.js";
export { AntiVanityHijack, type AntiVanityHijackConfig, type VanityChangeRecord } from "./anti-vanity-hijack.js";
export { EmojiStickerProtection, type EmojiStickerProtectionConfig, type EmojiData, type StickerData } from "./emoji-sticker-protection.js";
export { ForumChannelProtection, type ForumChannelProtectionConfig, type ForumTagData } from "./forum-channel-protection.js";

// IP & Access Management
export { IPBanSystem, type IPBanSystemConfig, type IPBanRecord, type VerifiedIPRecord, type BanResult, type IPBanResult, type UnbanResult } from "./ip-ban-system.js";
export { AdminWhitelistSystem, type AdminWhitelistSystemConfig, type WhitelistRecord } from "./admin-whitelist.js";

// Backup & Recovery
export { AutoBackupEngine, type AutoBackupEngineConfig, type ServerBackupData } from "./auto-backup-engine.js";
export { DailyBackup, type DailyBackupConfig } from "./daily-backup.js";
export { ServerSnapshotRestore, type ServerSnapshotRestoreConfig, type ServerSnapshotData } from "./server-snapshot-restore.js";

// Rate Limiting & Join Protection
export { JoinLimitShield, type JoinLimitShieldConfig, type JoinStatus } from "./join-limit-shield.js";
export { AntiInviteShield, type AntiInviteShieldConfig } from "./anti-invite-shield.js";
export { InviteTrackerEngine, type InviteTrackerEngineConfig, type UserInviteData, type JoinResult, type LeaveResult } from "./invite-tracker-engine.js";

// Audit & Monitoring
export { AuditLogMonitor, type AuditLogMonitorConfig, type AuditLogEntry } from "./audit-log-monitor.js";
export { AnomalyAI, type AnomalyAIConfig, type AnomalyLevel } from "./anomaly-ai.js";

// Auto-Healing & Permission Management
export { AutoHeal, type AutoHealConfig, type ChannelData, type RoleData } from "./auto-heal.js";
export { AutoPermissionRollback, type AutoPermissionRollbackConfig } from "./auto-permission-rollback.js";

// Honeypot & Session Security
export { HoneypotAdminRole, type HoneypotAdminRoleConfig } from "./honeypot-admin-role.js";
export { SessionHijackDetector, type SessionHijackDetectorConfig, type SessionData } from "./session-hijack-detector.js";
export { OAuthMaliciousAppDetector, type OAuthMaliciousAppDetectorConfig, type ScanResult } from "./oauth-malicious-app-detector.js";

// Token & License Management
export { BotTokenRotationSystem, type BotTokenRotationSystemConfig } from "./bot-token-rotation.js";
export { PremiumLicenseSystem, type PremiumLicenseSystemConfig } from "./premium-license-system.js";

// Infrastructure
export { MongoRedisEngine, type CacheStats, type BackupResult } from "./mongo-redis-engine.js";

// Legacy aliases for backward compatibility
export { NukeDefense as ZeroTrustSecurityEngine } from "./nuke-defense.js";
export { AIRaidPrediction as AiRaidPredictionEngine } from "./ai-raid-prediction.js";