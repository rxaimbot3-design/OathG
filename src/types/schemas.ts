/**
 * Zod Validation Schemas for All External Inputs
 * 
 * Provides runtime validation with TypeScript type inference
 */

import { z } from 'zod';
import type {
  UserId, GuildId, ChannelId, RoleId, MessageId, WebhookId,
  InviteCode, IPAddress, Snowflake, Timestamp, DurationMs,
  SecurityScore, ThreatLevel, PermissionBitfield, DiscordColor,
  Result
} from './branded.js';

// ============================================================================
// Primitive Branded Type Schemas
// ============================================================================

export const UserIdSchema = z.string().regex(/^\d{17,20}$/, 'Invalid UserId format');
export const GuildIdSchema = z.string().regex(/^\d{17,20}$/, 'Invalid GuildId format');
export const ChannelIdSchema = z.string().regex(/^\d{17,20}$/, 'Invalid ChannelId format');
export const RoleIdSchema = z.string().regex(/^\d{17,20}$/, 'Invalid RoleId format');
export const MessageIdSchema = z.string().regex(/^\d{17,20}$/, 'Invalid MessageId format');
export const WebhookIdSchema = z.string().regex(/^\d{17,20}$/, 'Invalid WebhookId format');
export const SnowflakeSchema = z.string().regex(/^\d{17,20}$/, 'Invalid Snowflake format');

export const InviteCodeSchema = z.string().regex(/^[a-zA-Z0-9]{1,32}$/, 'Invalid InviteCode format');

export const IPAddressSchema = z.string().refine(
  (ip) => {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  },
  'Invalid IP address format'
);

export const TimestampSchema = z.number().int().min(0).max(8640000000000000);
export const UnixTimestampSchema = z.number().int().min(0).max(253402300799);
export const UnixTimestampMsSchema = z.number().int().min(0).max(8640000000000000);
export const DurationMsSchema = z.number().int().min(0);

export const SecurityScoreSchema = z.number().int().min(0).max(100);
export const ThreatLevelSchema = z.number().int().min(0).max(5);

export const PermissionBitfieldSchema = z.bigint();
export const DiscordColorSchema = z.number().int().min(0).max(0xFFFFFF);

// ============================================================================
// Discord API Payload Schemas
// ============================================================================

export const DiscordUserSchema = z.object({
  id: UserIdSchema,
  username: z.string().min(1).max(32),
  discriminator: z.string().regex(/^\d{4}$/).optional(),
  global_name: z.string().min(1).max(32).nullable().optional(),
  avatar: z.string().nullable().optional(),
  bot: z.boolean().optional(),
  system: z.boolean().optional(),
  mfa_enabled: z.boolean().optional(),
  banner: z.string().nullable().optional(),
  accent_color: z.number().int().nullable().optional(),
  locale: z.string().optional(),
  verified: z.boolean().optional(),
  email: z.string().email().nullable().optional(),
  flags: z.number().int().optional(),
  premium_type: z.number().int().optional(),
  public_flags: z.number().int().optional(),
});

export const DiscordGuildSchema = z.object({
  id: GuildIdSchema,
  name: z.string().min(1).max(100),
  icon: z.string().nullable().optional(),
  icon_hash: z.string().nullable().optional(),
  splash: z.string().nullable().optional(),
  discovery_splash: z.string().nullable().optional(),
  owner_id: UserIdSchema,
  permissions: z.string().optional(), // Permission bitfield as string
  region: z.string().optional(),
  afk_channel_id: ChannelIdSchema.nullable().optional(),
  afk_timeout: z.number().int().optional(),
  widget_enabled: z.boolean().optional(),
  widget_channel_id: ChannelIdSchema.nullable().optional(),
  verification_level: z.number().int().min(0).max(4).optional(),
  default_message_notifications: z.number().int().min(0).max(1).optional(),
  explicit_content_filter: z.number().int().min(0).max(2).optional(),
  roles: z.array(z.object({
    id: RoleIdSchema,
    name: z.string().min(1).max(100),
    color: z.number().int().min(0).max(0xFFFFFF),
    hoist: z.boolean(),
    icon: z.string().nullable().optional(),
    unicode_emoji: z.string().nullable().optional(),
    position: z.number().int(),
    permissions: z.string(),
    managed: z.boolean(),
    mentionable: z.boolean(),
    tags: z.record(z.unknown()).optional(),
    flags: z.number().int().optional(),
  })).optional(),
  emojis: z.array(z.object({
    id: SnowflakeSchema,
    name: z.string().min(1).max(32),
    roles: z.array(RoleIdSchema).optional(),
    user: DiscordUserSchema.optional(),
    require_colons: z.boolean().optional(),
    managed: z.boolean().optional(),
    animated: z.boolean().optional(),
    available: z.boolean().optional(),
  })).optional(),
  features: z.array(z.string()).optional(),
  mfa_level: z.number().int().min(0).max(1).optional(),
  application_id: SnowflakeSchema.nullable().optional(),
  system_channel_id: ChannelIdSchema.nullable().optional(),
  system_channel_flags: z.number().int().optional(),
  rules_channel_id: ChannelIdSchema.nullable().optional(),
  max_presences: z.number().int().nullable().optional(),
  max_members: z.number().int().optional(),
  vanity_url_code: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  banner: z.string().nullable().optional(),
  premium_tier: z.number().int().min(0).max(3).optional(),
  premium_subscription_count: z.number().int().optional(),
  preferred_locale: z.string().optional(),
  public_updates_channel_id: ChannelIdSchema.nullable().optional(),
  max_video_channel_users: z.number().int().optional(),
  approximate_member_count: z.number().int().optional(),
  approximate_presence_count: z.number().int().optional(),
  welcome_screen: z.unknown().nullable().optional(),
  nsfw_level: z.number().int().min(0).max(3).optional(),
  stickers: z.array(z.unknown()).optional(),
  premium_progress_bar_enabled: z.boolean().optional(),
});

export const DiscordChannelSchema = z.object({
  id: ChannelIdSchema,
  type: z.number().int().min(0).max(15),
  guild_id: GuildIdSchema.optional(),
  position: z.number().int().optional(),
  permission_overwrites: z.array(z.object({
    id: SnowflakeSchema,
    type: z.number().int().min(0).max(1),
    allow: z.string(),
    deny: z.string(),
  })).optional(),
  name: z.string().min(1).max(100).optional(),
  topic: z.string().max(1024).nullable().optional(),
  nsfw: z.boolean().optional(),
  last_message_id: MessageIdSchema.nullable().optional(),
  bitrate: z.number().int().optional(),
  user_limit: z.number().int().optional(),
  rate_limit_per_user: z.number().int().optional(),
  recipients: z.array(DiscordUserSchema).optional(),
  icon: z.string().nullable().optional(),
  owner_id: UserIdSchema.optional(),
  application_id: SnowflakeSchema.nullable().optional(),
  managed: z.boolean().optional(),
  parent_id: ChannelIdSchema.nullable().optional(),
  last_pin_timestamp: z.string().datetime().nullable().optional(),
  rtc_region: z.string().nullable().optional(),
  video_quality_mode: z.number().int().optional(),
  message_count: z.number().int().optional(),
  member_count: z.number().int().optional(),
  thread_metadata: z.object({
    archived: z.boolean(),
    auto_archive_duration: z.number().int(),
    archive_timestamp: z.string().datetime(),
    locked: z.boolean(),
    invitable: z.boolean(),
    create_timestamp: z.string().datetime().optional(),
  }).optional(),
  member: z.object({
    id: UserIdSchema,
    user_id: UserIdSchema,
    join_timestamp: z.string().datetime(),
    flags: z.number().int(),
  }).optional(),
  default_auto_archive_duration: z.number().int().optional(),
  permissions: z.string().optional(),
  flags: z.number().int().optional(),
  total_message_sent: z.number().int().optional(),
  available_tags: z.array(z.object({
    id: SnowflakeSchema,
    name: z.string().min(1).max(20),
    moderated: z.boolean(),
    emoji_id: SnowflakeSchema.nullable().optional(),
    emoji_name: z.string().nullable().optional(),
  })).optional(),
  applied_tags: z.array(SnowflakeSchema).optional(),
  default_reaction_emoji: z.object({
    emoji_id: SnowflakeSchema.nullable().optional(),
    emoji_name: z.string().nullable().optional(),
    emoji_unicode: z.string().nullable().optional(),
  }).nullable().optional(),
  default_thread_rate_limit_per_user: z.number().int().optional(),
  default_sort_order: z.number().int().optional(),
  default_forum_layout: z.number().int().optional(),
});

export const DiscordRoleSchema = z.object({
  id: RoleIdSchema,
  name: z.string().min(1).max(100),
  color: z.number().int().min(0).max(0xFFFFFF),
  hoist: z.boolean(),
  icon: z.string().nullable().optional(),
  unicode_emoji: z.string().nullable().optional(),
  position: z.number().int(),
  permissions: z.string(),
  managed: z.boolean(),
  mentionable: z.boolean(),
  tags: z.record(z.unknown()).optional(),
  flags: z.number().int().optional(),
});

export const DiscordMessageSchema = z.object({
  id: MessageIdSchema,
  channel_id: ChannelIdSchema,
  author: DiscordUserSchema,
  content: z.string().max(2000),
  timestamp: z.string().datetime(),
  edited_timestamp: z.string().datetime().nullable().optional(),
  tts: z.boolean(),
  mention_everyone: z.boolean(),
  mentions: z.array(DiscordUserSchema),
  mention_roles: z.array(RoleIdSchema),
  mention_channels: z.array(z.object({
    id: ChannelIdSchema,
    guild_id: GuildIdSchema,
    type: z.number().int(),
    name: z.string(),
  })).optional(),
  attachments: z.array(z.object({
    id: SnowflakeSchema,
    filename: z.string(),
    description: z.string().nullable().optional(),
    content_type: z.string().nullable().optional(),
    size: z.number().int(),
    url: z.string().url(),
    proxy_url: z.string().url(),
    height: z.number().int().nullable().optional(),
    width: z.number().int().nullable().optional(),
    ephemeral: z.boolean().optional(),
  })),
  embeds: z.array(z.object({
    type: z.string(),
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    url: z.string().url().nullable().optional(),
    timestamp: z.string().datetime().nullable().optional(),
    color: z.number().int().nullable().optional(),
    footer: z.object({
      text: z.string(),
      icon_url: z.string().url().nullable().optional(),
      proxy_icon_url: z.string().url().nullable().optional(),
    }).nullable().optional(),
    image: z.object({
      url: z.string().url(),
      proxy_url: z.string().url(),
      height: z.number().int(),
      width: z.number().int(),
    }).nullable().optional(),
    thumbnail: z.object({
      url: z.string().url(),
      proxy_url: z.string().url(),
      height: z.number().int(),
      width: z.number().int(),
    }).nullable().optional(),
    video: z.object({
      url: z.string().url(),
      proxy_url: z.string().url(),
      height: z.number().int(),
      width: z.number().int(),
    }).nullable().optional(),
    provider: z.object({
      name: z.string().nullable().optional(),
      url: z.string().url().nullable().optional(),
    }).nullable().optional(),
    author: z.object({
      name: z.string(),
      url: z.string().url().nullable().optional(),
      icon_url: z.string().url().nullable().optional(),
      proxy_icon_url: z.string().url().nullable().optional(),
    }).nullable().optional(),
    fields: z.array(z.object({
      name: z.string(),
      value: z.string(),
      inline: z.boolean(),
    })).optional(),
  })),
  reactions: z.array(z.object({
    count: z.number().int(),
    me: z.boolean(),
    emoji: z.object({
      id: SnowflakeSchema.nullable().optional(),
      name: z.string().nullable().optional(),
      animated: z.boolean().optional(),
    }),
  })).optional(),
  nonce: z.union([z.string(), z.number().int()]).optional(),
  pinned: z.boolean(),
  webhook_id: WebhookIdSchema.nullable().optional(),
  type: z.number().int().min(0).max(19),
  activity: z.unknown().nullable().optional(),
  application: z.unknown().nullable().optional(),
  application_id: SnowflakeSchema.nullable().optional(),
  message_reference: z.object({
    message_id: MessageIdSchema.nullable().optional(),
    channel_id: ChannelIdSchema,
    guild_id: GuildIdSchema.optional(),
    fail_if_not_exists: z.boolean().optional(),
  }).nullable().optional(),
  flags: z.number().int().optional(),
  referenced_message: z.unknown().nullable().optional(),
  interaction_metadata: z.object({
    id: SnowflakeSchema,
    type: z.number().int(),
    user: DiscordUserSchema,
    authorizing_integration_owners: z.record(z.string()).optional(),
    original_response_message_id: MessageIdSchema.nullable().optional(),
    interacted_message_id: MessageIdSchema.nullable().optional(),
    triggering_interaction_metadata: z.unknown().nullable().optional(),
  }).nullable().optional(),
  interaction: z.object({
    id: SnowflakeSchema,
    type: z.number().int(),
    name: z.string(),
    user: DiscordUserSchema,
    member: z.unknown().optional(),
  }).nullable().optional(),
  thread: DiscordChannelSchema.nullable().optional(),
  components: z.array(z.unknown()).optional(),
  sticker_items: z.array(z.object({
    id: SnowflakeSchema,
    name: z.string(),
    format_type: z.number().int(),
  })).optional(),
  stickers: z.array(z.unknown()).optional(),
  position: z.number().int().optional(),
  role_subscription_data: z.unknown().nullable().optional(),
  resolved: z.unknown().nullable().optional(),
});

export const DiscordAuditLogEntrySchema = z.object({
  id: SnowflakeSchema,
  action_type: z.number().int(),
  guild_id: GuildIdSchema,
  target_id: SnowflakeSchema.nullable().optional(),
  user_id: UserIdSchema.nullable().optional(),
  reason: z.string().nullable().optional(),
  options: z.record(z.unknown()).optional(),
  changes: z.array(z.object({
    key: z.string(),
    old_value: z.unknown().nullable().optional(),
    new_value: z.unknown().nullable().optional(),
  })).optional(),
  created_at: z.string().datetime(),
});

export const DiscordInviteSchema = z.object({
  code: InviteCodeSchema,
  guild_id: GuildIdSchema.optional(),
  channel_id: ChannelIdSchema.optional(),
  inviter: DiscordUserSchema.nullable().optional(),
  target_user: DiscordUserSchema.nullable().optional(),
  target_type: z.number().int().nullable().optional(),
  target_application: z.unknown().nullable().optional(),
  approximate_presence_count: z.number().int().nullable().optional(),
  approximate_member_count: z.number().int().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  stage_instance: z.unknown().nullable().optional(),
  guild_scheduled_event: z.unknown().nullable().optional(),
  uses: z.number().int().nullable().optional(),
  max_uses: z.number().int().nullable().optional(),
  max_age: z.number().int().nullable().optional(),
  temporary: z.boolean().nullable().optional(),
  created_at: z.string().datetime().nullable().optional(),
  flags: z.number().int().nullable().optional(),
});

export const DiscordWebhookSchema = z.object({
  id: WebhookIdSchema,
  type: z.number().int().min(1).max(2),
  guild_id: GuildIdSchema.nullable().optional(),
  channel_id: ChannelIdSchema.nullable().optional(),
  user: DiscordUserSchema.nullable().optional(),
  name: z.string().min(1).max(80).nullable().optional(),
  avatar: z.string().nullable().optional(),
  token: z.string().nullable().optional(),
  application_id: SnowflakeSchema.nullable().optional(),
  source_guild: z.unknown().nullable().optional(),
  source_channel: z.unknown().nullable().optional(),
  url: z.string().url().nullable().optional(),
});

export const DiscordBanSchema = z.object({
  reason: z.string().nullable().optional(),
  user: DiscordUserSchema,
});

export const DiscordIntegrationSchema = z.object({
  id: SnowflakeSchema,
  name: z.string(),
  type: z.string(),
  enabled: z.boolean(),
  syncing: z.boolean().optional(),
  role_id: RoleIdSchema.nullable().optional(),
  enable_emoticons: z.boolean().optional(),
  expire_behavior: z.number().int().optional(),
  expire_grace_period: z.number().int().optional(),
  user: DiscordUserSchema.optional(),
  account: z.object({
    id: z.string(),
    name: z.string(),
  }).optional(),
  synced_at: z.string().datetime().nullable().optional(),
  subscriber_count: z.number().int().nullable().optional(),
  revoked: z.boolean().nullable().optional(),
  application: z.unknown().nullable().optional(),
  scopes: z.array(z.string()).optional(),
});

// ============================================================================
// Security Configuration Schemas
// ============================================================================

export const VelocityThresholdSchema = z.object({
  count: z.number().int().positive(),
  windowMs: DurationMsSchema,
});

export const VelocityThresholdsSchema = z.object({
  channelCreate: VelocityThresholdSchema,
  channelDelete: VelocityThresholdSchema,
  roleCreate: VelocityThresholdSchema,
  roleDelete: VelocityThresholdSchema,
  roleUpdate: VelocityThresholdSchema,
  permissionUpdate: VelocityThresholdSchema,
  massBanKick: VelocityThresholdSchema,
  webhookCreate: VelocityThresholdSchema,
  webhookUpdate: VelocityThresholdSchema,
  botAddition: VelocityThresholdSchema,
  guildMemberAdd: VelocityThresholdSchema,
  burst: VelocityThresholdSchema,
});

export const RiskWeightsSchema = z.object({
  channelCreate: z.number().int().min(0).max(100),
  channelDelete: z.number().int().min(0).max(100),
  roleCreate: z.number().int().min(0).max(100),
  roleUpdate: z.number().int().min(0).max(100),
  permissionUpdate: z.number().int().min(0).max(100),
  massBanKick: z.number().int().min(0).max(100),
  webhookAbuse: z.number().int().min(0).max(100),
  botAddition: z.number().int().min(0).max(100),
  massAction: z.number().int().min(0).max(100),
});

export const ActionThresholdsSchema = z.object({
  quarantine: z.number().int().min(1).max(100),
  lockdown: z.number().int().min(1).max(100),
});

export const ResourceBoundsSchema = z.object({
  maxQueueSize: z.number().int().positive(),
  maxCriticalQueue: z.number().int().positive(),
  maxConcurrency: z.number().int().positive(),
  maxCacheEntries: z.number().int().positive(),
  maxDecisionLog: z.number().int().positive(),
});

export const TimeoutsSchema = z.object({
  auditLogFetch: z.number().int().positive(),
  auditLogRetryDelay: z.number().int().positive(),
  auditLogMaxRetries: z.number().int().positive(),
  discordRestTimeout: z.number().int().positive(),
  circuitBreakerTimeout: z.number().int().positive(),
  shutdownDrainTimeout: z.number().int().positive(),
});

export const FeaturesSchema = z.object({
  enableCircuitBreaker: z.boolean(),
  enableIdempotency: z.boolean(),
  enableCorrelationIds: z.boolean(),
  strictOwnerOnly: z.boolean(),
});

export const SecurityConfigSchema = z.object({
  velocityThresholds: VelocityThresholdsSchema,
  riskWeights: RiskWeightsSchema,
  actionThresholds: ActionThresholdsSchema,
  resourceBounds: ResourceBoundsSchema,
  timeouts: TimeoutsSchema,
  features: FeaturesSchema,
});

// ============================================================================
// Command Input Schemas
// ============================================================================

export interface SlashCommandOptionType {
  name: string;
  description: string;
  type: number;
  required?: boolean;
  choices?: Array<{ name: string; value: string | number }>;
  options?: SlashCommandOptionType[];
  channel_types?: number[];
  min_value?: number;
  max_value?: number;
  min_length?: number;
  max_length?: number;
  autocomplete?: boolean;
}

export const SlashCommandOptionSchema: z.ZodType<SlashCommandOptionType> = z.object({
  name: z.string().min(1).max(32),
  description: z.string().min(1).max(100),
  type: z.number().int().min(1).max(11),
  required: z.boolean().optional(),
  choices: z.array(z.object({
    name: z.string().min(1).max(100),
    value: z.union([z.string(), z.number().int()]),
  })).optional(),
  options: z.array(z.lazy(() => SlashCommandOptionSchema)).optional(),
  channel_types: z.array(z.number().int()).optional(),
  min_value: z.number().optional(),
  max_value: z.number().optional(),
  min_length: z.number().int().optional(),
  max_length: z.number().int().optional(),
  autocomplete: z.boolean().optional(),
});

export const SlashCommandSchema = z.object({
  name: z.string().min(1).max(32).regex(/^[\w-]+$/),
  description: z.string().min(1).max(100),
  default_member_permissions: z.string().optional(),
  dm_permission: z.boolean().optional(),
  options: z.array(SlashCommandOptionSchema).optional(),
});

// ============================================================================
// Webhook Payload Schemas
// ============================================================================

export const GitHubWebhookPayloadSchema = z.object({
  action: z.string().optional(),
  repository: z.object({
    id: z.number().int(),
    name: z.string(),
    full_name: z.string(),
    owner: z.object({
      login: z.string(),
      id: z.number().int(),
    }),
    html_url: z.string().url(),
    description: z.string().nullable().optional(),
    private: z.boolean(),
    fork: z.boolean(),
  }),
  sender: z.object({
    login: z.string(),
    id: z.number().int(),
  }),
  commits: z.array(z.object({
    id: z.string(),
    message: z.string(),
    timestamp: z.string().datetime(),
    author: z.object({
      name: z.string(),
      email: z.string().email(),
      username: z.string(),
    }),
    url: z.string().url(),
  })).optional(),
  pusher: z.object({
    name: z.string(),
    email: z.string().email(),
  }).optional(),
  ref: z.string().optional(),
  ref_type: z.string().optional(),
  pull_request: z.unknown().optional(),
  issue: z.unknown().optional(),
  release: z.unknown().optional(),
});

export const DiscordWebhookPayloadSchema = z.object({
  id: SnowflakeSchema,
  type: z.number().int().min(0).max(15),
  guild_id: GuildIdSchema.optional(),
  channel_id: ChannelIdSchema.optional(),
  user: DiscordUserSchema.optional(),
  member: z.object({
    user: DiscordUserSchema,
    nick: z.string().nullable().optional(),
    roles: z.array(RoleIdSchema),
    joined_at: z.string().datetime(),
    premium_since: z.string().datetime().nullable().optional(),
    deaf: z.boolean(),
    mute: z.boolean(),
    pending: z.boolean().optional(),
    permissions: z.string().optional(),
    communication_disabled_until: z.string().datetime().nullable().optional(),
    flags: z.number().int().optional(),
  }).optional(),
  message: DiscordMessageSchema.optional(),
  before: DiscordMessageSchema.optional(),
  after: DiscordMessageSchema.optional(),
  audit_log_entry: DiscordAuditLogEntrySchema.optional(),
  guild: DiscordGuildSchema.optional(),
  role: DiscordRoleSchema.optional(),
  invite: DiscordInviteSchema.optional(),
  webhook: DiscordWebhookSchema.optional(),
  integration: DiscordIntegrationSchema.optional(),
  ban: DiscordBanSchema.optional(),
  emoji: z.unknown().optional(),
  sticker: z.unknown().optional(),
  stage_instance: z.unknown().optional(),
  guild_scheduled_event: z.unknown().optional(),
  thread: DiscordChannelSchema.optional(),
  application_command: z.unknown().optional(),
  interaction: z.unknown().optional(),
});

// ============================================================================
// Environment Variable Schemas
// ============================================================================

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DISCORD_BOT_TOKEN: z.string().min(50),
  DISCORD_CLIENT_ID: z.string().regex(/^\d{17,20}$/),
  DISCORD_CLIENT_SECRET: z.string().min(10).optional(),
  GEMINI_API_KEY: z.string().min(10).optional(),
  ADMIN_SECRET: z.string().min(32).optional(),
  REDIS_URL: z.string().url().optional(),
  MONGODB_URI: z.string().min(10).optional(),
  DATABASE_URL: z.string().min(10).optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  WEB_BASE_URL: z.string().url().optional(),
  ENABLE_METRICS: z.coerce.boolean().default(true),
  ENABLE_TRACING: z.coerce.boolean().default(false),
  SENTRY_DSN: z.string().url().optional(),
});

// ============================================================================
// Validation Helper Functions
// ============================================================================

export function validateConfig<T>(schema: z.ZodSchema<T>, data: unknown): Result<T, z.ZodError> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, error: result.error };
}

export function validateConfigSync<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = validateConfig(schema, data);
  if (!result.ok) {
    throw new Error(`Validation failed: ${result.error.message}`);
  }
  return result.value;
}

export function validateEnv(): z.infer<typeof EnvSchema> {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Validation failed: ${result.error.message}`);
  }
  return result.data as z.infer<typeof EnvSchema>;
}

// ============================================================================
// Type Inference Helpers
// ============================================================================

export type DiscordUser = z.infer<typeof DiscordUserSchema>;
export type DiscordGuild = z.infer<typeof DiscordGuildSchema>;
export type DiscordChannel = z.infer<typeof DiscordChannelSchema>;
export type DiscordRole = z.infer<typeof DiscordRoleSchema>;
export type DiscordMessage = z.infer<typeof DiscordMessageSchema>;
export type DiscordAuditLogEntry = z.infer<typeof DiscordAuditLogEntrySchema>;
export type DiscordInvite = z.infer<typeof DiscordInviteSchema>;
export type DiscordWebhook = z.infer<typeof DiscordWebhookSchema>;
export type DiscordBan = z.infer<typeof DiscordBanSchema>;
export type DiscordIntegration = z.infer<typeof DiscordIntegrationSchema>;

export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export type VelocityThresholds = z.infer<typeof VelocityThresholdsSchema>;
export type RiskWeights = z.infer<typeof RiskWeightsSchema>;
export type ActionThresholds = z.infer<typeof ActionThresholdsSchema>;
export type ResourceBounds = z.infer<typeof ResourceBoundsSchema>;
export type Timeouts = z.infer<typeof TimeoutsSchema>;
export type Features = z.infer<typeof FeaturesSchema>;

export type EnvConfig = z.infer<typeof EnvSchema>;
export type SlashCommand = z.infer<typeof SlashCommandSchema>;
export type SlashCommandOption = z.infer<typeof SlashCommandOptionSchema>;
export type GitHubWebhookPayload = z.infer<typeof GitHubWebhookPayloadSchema>;
export type DiscordWebhookPayload = z.infer<typeof DiscordWebhookPayloadSchema>;