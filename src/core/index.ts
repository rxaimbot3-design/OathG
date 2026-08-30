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
