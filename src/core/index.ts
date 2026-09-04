/**
 * Core module exports.
 */

export type { BotContext, DefaultBotContext } from "./contexts/BotContext";
export { botContext } from "./contexts/BotContext";
export { GuildStateStore } from "./contexts/GuildStateStore";
export { GuildContext } from "./contexts/GuildContext";

export type { SecurityModule } from "./interfaces/SecurityModule";
export type { 
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
  HoneypotAdminRoleModule 
} from "./interfaces/SecurityModule";

export { UltraLowLatencyPipeline, ultraLowLatencyPipeline, type PipelineEvent, type PipelineMetrics } from "./UltraLowLatencyPipeline.js";
export { MultiShardCluster, multiShardCluster, type ShardConfig, type WorkerMetrics, type ClusterMetrics } from "./MultiShardCluster.js";
export { EdgeCacheSystem, edgeCacheSystem, type CacheEntry, type CacheConfig, type CacheStats, type EdgeLocation } from "./EdgeCacheSystem.js";
export { BenchmarkEvidenceSystem, benchmarkEvidenceSystem, type BenchmarkResult, type StressTestConfig, type ProofOfPerformance } from "./BenchmarkEvidenceSystem.js";
export { SelfHealingInfrastructure, selfHealingInfrastructure, type HealthCheck, type SystemHealth, type Incident, type HealingAction } from "./SelfHealingInfrastructure.js";
export { UltimateBotIntegration, ultimateBotIntegration } from "./UltimateIntegration.js";
export { VoiceProcessingEngine, voiceProcessingEngine, type VoiceConfig, type VoiceSession, type TranscriptionResult, type VoiceAnalytics } from "./VoiceProcessingEngine.js";
export { AdvancedAIModerator, advancedAIModerator, type AIModeratorConfig, type CustomRule, type ModerationContext, type ModerationResult, type AIInsight } from "./AdvancedAIModerator.js";
export { PluginSystem, pluginSystem, type PluginManifest, type PluginInstance, type PluginContext, type PluginAPI, type PluginCommand, type PluginMiddleware, type PluginWebRoute, type PluginStorage, type PluginUtils } from "./PluginSystem.js";
export { RealtimeAnalyticsDashboard, realtimeAnalyticsDashboard, type DashboardConfig, type MetricSeries, type DashboardWidget, type DashboardLayout, type AlertRule, type Alert } from "./RealtimeAnalyticsDashboard.js";
export { ThreatIntelligenceSystem, threatIntelligenceSystem, type ThreatIntelConfig, type ThreatFeed, type ThreatIndicator, type ThreatActor, type ThreatCampaign, type BlockchainAuditEntry, type ThreatIntelStats } from "./ThreatIntelligenceSystem.js";
