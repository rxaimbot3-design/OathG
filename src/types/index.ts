/**
 * Type System Index
 * 
 * Central export for all type definitions
 */

// Branded types for compile-time safety
export * from './branded.js';

// Event types for security monitoring
export * from './events.js';

// Zod validation schemas
export * from './schemas.js';

// Re-export commonly used types
export type {
  // Primitive branded types
  UserId,
  GuildId,
  ChannelId,
  RoleId,
  MessageId,
  WebhookId,
  InviteCode,
  IPAddress,
  Snowflake,
  Timestamp,
  UnixTimestamp,
  UnixTimestampMs,
  DurationMs,
  DurationSeconds,
  DurationMinutes,
  RateLimitCount,
  RateLimitWindow,
  SecurityScore,
  ThreatLevel,
  PermissionBitfield,
  DiscordColor,
  
  // Result types
  Result,
  AsyncResult,
} from './branded.js';

export type {
  // Security events
  BaseSecurityEvent,
  SecurityActionEvent,
  VelocityEvent,
  ThreatDetectionEvent,
  PunishmentEvent,
  AuditLogEvent,
  ConfigChangeEvent,
  HealthCheckEvent,
  RateLimitEvent,
  IPBanEvent,
  HoneypotEvent,
  InviteEvent,
  BotJoinEvent,
  WebhookEvent,
  MemberJoinEvent,
  SentimentEvent,
  BehaviorScoreEvent,
  BackupEvent,
  SystemEvent,
  SecurityEvent,
  
  // Supporting types
  ThreatIndicator,
  AuditLogChange,
  HealthCheck,
  SystemMetrics,
  GeolocationData,
  MemberQualityFlags,
  BehaviorFactor,
  
  // Handler types
  EventHandler,
  EventBus,
  EventStore,
} from './events.js';

export type {
  // Schema inference types
  DiscordUser,
  DiscordGuild,
  DiscordChannel,
  DiscordRole,
  DiscordMessage,
  DiscordAuditLogEntry,
  DiscordInvite,
  DiscordWebhook,
  DiscordBan,
  DiscordIntegration,
  
  SecurityConfig,
  VelocityThresholds,
  RiskWeights,
  ActionThresholds,
  ResourceBounds,
  Timeouts,
  Features,
  
  EnvConfig,
  SlashCommand,
  SlashCommandOption,
  GitHubWebhookPayload,
  DiscordWebhookPayload,
} from './schemas.js';

export {
  // Schema validators
  validateConfig,
  validateConfigSync,
  validateEnv,
  
  // Schema objects
  UserIdSchema,
  GuildIdSchema,
  ChannelIdSchema,
  RoleIdSchema,
  MessageIdSchema,
  WebhookIdSchema,
  SnowflakeSchema,
  InviteCodeSchema,
  IPAddressSchema,
  TimestampSchema,
  UnixTimestampSchema,
  UnixTimestampMsSchema,
  DurationMsSchema,
  SecurityScoreSchema,
  ThreatLevelSchema,
  PermissionBitfieldSchema,
  DiscordColorSchema,
  
  DiscordUserSchema,
  DiscordGuildSchema,
  DiscordChannelSchema,
  DiscordRoleSchema,
  DiscordMessageSchema,
  DiscordAuditLogEntrySchema,
  DiscordInviteSchema,
  DiscordWebhookSchema,
  DiscordBanSchema,
  DiscordIntegrationSchema,
  
  VelocityThresholdSchema,
  VelocityThresholdsSchema,
  RiskWeightsSchema,
  ActionThresholdsSchema,
  ResourceBoundsSchema,
  TimeoutsSchema,
  FeaturesSchema,
  SecurityConfigSchema,
  
  SlashCommandOptionSchema,
  SlashCommandSchema,
  
  GitHubWebhookPayloadSchema,
  DiscordWebhookPayloadSchema,
  
  EnvSchema,
} from './schemas.js';