/**
 * Comprehensive Security Event Types
 * 
 * Type-safe event definitions for all security-relevant Discord events
 */

import type { 
  UserId, GuildId, ChannelId, RoleId, MessageId, WebhookId, 
  InviteCode, IPAddress, Snowflake, Timestamp, UnixTimestampMs, DurationMs,
  SecurityScore, ThreatLevel, PermissionBitfield, DiscordColor,
  Result, AsyncResult
} from './branded.js';

/**
 * Base security event interface
 */
export interface BaseSecurityEvent {
  readonly eventId: Snowflake;
  readonly timestamp: Timestamp;
  readonly guildId: GuildId;
  readonly correlationId: string;
}

/**
 * Security action types
 */
export type SecurityActionType = 
  | 'channel_create'
  | 'channel_delete'
  | 'channel_update'
  | 'role_create'
  | 'role_delete'
  | 'role_update'
  | 'member_ban_add'
  | 'member_ban_remove'
  | 'member_kick'
  | 'member_prune'
  | 'member_role_update'
  | 'webhook_create'
  | 'webhook_update'
  | 'webhook_delete'
  | 'bot_add'
  | 'integration_create'
  | 'integration_update'
  | 'integration_delete'
  | 'guild_update'
  | 'invite_create'
  | 'invite_delete'
  | 'message_delete'
  | 'message_bulk_delete'
  | 'emoji_create'
  | 'emoji_update'
  | 'emoji_delete'
  | 'sticker_create'
  | 'sticker_update'
  | 'sticker_delete';

/**
 * Security event with action details
 */
export interface SecurityActionEvent extends BaseSecurityEvent {
  readonly actionType: SecurityActionType;
  readonly executorId: UserId | null;
  readonly targetId: Snowflake | null;
  readonly previousState: unknown;
  readonly newState: unknown;
  readonly isReverted: boolean;
  readonly threatLevel: ThreatLevel;
}

/**
 * Velocity tracking event
 */
export interface VelocityEvent extends BaseSecurityEvent {
  readonly actionType: SecurityActionType;
  readonly executorId: UserId;
  readonly count: number;
  readonly windowMs: DurationMs;
  readonly threshold: number;
  readonly exceeded: boolean;
}

/**
 * Threat detection event
 */
export interface ThreatDetectionEvent extends BaseSecurityEvent {
  readonly threatType: 'raid' | 'nuke' | 'spam' | 'phishing' | 'malicious_link' | 'unauthorized_bot' | 'privilege_escalation' | 'mass_action';
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly indicators: ThreatIndicator[];
  readonly confidence: number; // 0-1
  readonly recommendedActions: string[];
}

export interface ThreatIndicator {
  readonly type: string;
  readonly value: unknown;
  readonly weight: number;
  readonly description: string;
}

/**
 * Punishment event
 */
export interface PunishmentEvent extends BaseSecurityEvent {
  readonly punishmentType: 'ban' | 'kick' | 'timeout' | 'role_strip' | 'channel_lockdown' | 'ip_ban' | 'quarantine';
  readonly targetId: UserId;
  readonly executorId: UserId;
  readonly reason: string;
  readonly duration: DurationMs | null;
  readonly success: boolean;
  readonly error?: string;
}

/**
 * Audit log entry event
 */
export interface AuditLogEvent extends BaseSecurityEvent {
  readonly entryId: Snowflake;
  readonly actionType: SecurityActionType;
  readonly executorId: UserId;
  readonly targetId: Snowflake | null;
  readonly changes: AuditLogChange[];
  readonly isProcessed: boolean;
}

export interface AuditLogChange {
  readonly key: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

/**
 * Configuration change event
 */
export interface ConfigChangeEvent extends BaseSecurityEvent {
  readonly configKey: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly changedBy: UserId;
  readonly requiresRestart: boolean;
}

/**
 * Health check event
 */
export interface HealthCheckEvent extends BaseSecurityEvent {
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly checks: HealthCheck[];
  readonly metrics: SystemMetrics;
}

export interface HealthCheck {
  readonly name: string;
  readonly status: 'pass' | 'warn' | 'fail';
  readonly latencyMs: number;
  readonly details?: string;
}

export interface SystemMetrics {
  readonly memoryUsageMB: number;
  readonly cpuUsagePercent: number;
  readonly eventQueueSize: number;
  readonly activeConnections: number;
  readonly shardLatencyMs: number;
  readonly apiLatencyMs: number;
}

/**
 * Rate limit event
 */
export interface RateLimitEvent extends BaseSecurityEvent {
  readonly identifier: string;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: UnixTimestampMs;
  readonly exceeded: boolean;
  readonly scope: 'user' | 'guild' | 'global' | 'ip';
}

/**
 * IP Ban event
 */
export interface IPBanEvent extends BaseSecurityEvent {
  readonly ipAddress: IPAddress;
  readonly action: 'ban' | 'unban' | 'check';
  readonly associatedUserIds: UserId[];
  readonly reason: string;
  readonly triggeredBy: 'manual' | 'automatic' | 'honeypot' | 'threat_intel';
}

/**
 * Honeypot trigger event
 */
export interface HoneypotEvent extends BaseSecurityEvent {
  readonly trapName: string;
  readonly ipAddress: IPAddress;
  readonly userId: UserId | null;
  readonly userAgent: string | null;
  readonly referrer: string | null;
  readonly geolocation: GeolocationData | null;
}

export interface GeolocationData {
  readonly country: string;
  readonly region: string;
  readonly city: string;
  readonly isp: string;
  readonly isVpn: boolean;
  readonly isProxy: boolean;
  readonly isTor: boolean;
}

/**
 * Invite tracking event
 */
export interface InviteEvent extends BaseSecurityEvent {
  readonly inviteCode: InviteCode;
  readonly inviterId: UserId;
  readonly joinerId: UserId | null;
  readonly action: 'create' | 'use' | 'delete' | 'expire';
  readonly uses: number;
  readonly maxUses: number | null;
  readonly isAuthorized: boolean;
}

/**
 * Bot join event
 */
export interface BotJoinEvent extends BaseSecurityEvent {
  readonly botId: UserId;
  readonly inviterId: UserId | null;
  readonly isApproved: boolean;
  readonly actionTaken: 'allowed' | 'kicked' | 'banned';
  readonly permissions: PermissionBitfield;
}

/**
 * Webhook event
 */
export interface WebhookEvent extends BaseSecurityEvent {
  readonly webhookId: WebhookId;
  readonly channelId: ChannelId;
  readonly action: 'create' | 'update' | 'delete' | 'execute';
  readonly executorId: UserId;
  readonly isAuthorized: boolean;
  readonly tokenExposed: boolean;
}

/**
 * Member join event with quality checks
 */
export interface MemberJoinEvent extends BaseSecurityEvent {
  readonly userId: UserId;
  readonly accountAgeDays: number;
  readonly hasAvatar: boolean;
  readonly isBot: boolean;
  readonly qualityFlags: MemberQualityFlags;
  readonly inviteCode: InviteCode | null;
  readonly inviterId: UserId | null;
  readonly actionTaken: 'allowed' | 'quarantined' | 'banned' | 'verified';
}

export interface MemberQualityFlags {
  readonly isNewAccount: boolean;
  readonly noAvatar: boolean;
  readonly suspiciousName: boolean;
  readonly knownRaidPattern: boolean;
  readonly vpnDetected: boolean;
  readonly proxyDetected: boolean;
  readonly torDetected: boolean;
}

/**
 * Sentiment analysis event
 */
export interface SentimentEvent extends BaseSecurityEvent {
  readonly userId: UserId;
  readonly channelId: ChannelId;
  readonly messageId: MessageId;
  readonly sentimentScore: number; // -1 to 1
  readonly toxicityScore: number; // 0 to 1
  readonly threatScore: number; // 0 to 1
  readonly flaggedTerms: string[];
  readonly actionTaken: 'none' | 'warning' | 'timeout' | 'quarantine' | 'ban';
}

/**
 * Behavior scoring event
 */
export interface BehaviorScoreEvent extends BaseSecurityEvent {
  readonly userId: UserId;
  readonly previousScore: number;
  readonly newScore: number;
  readonly factors: BehaviorFactor[];
  readonly thresholdExceeded: boolean;
  readonly actionTaken: string | null;
}

export interface BehaviorFactor {
  readonly name: string;
  readonly weight: number;
  readonly value: number;
  readonly description: string;
}

/**
 * Backup/Restore event
 */
export interface BackupEvent extends BaseSecurityEvent {
  readonly backupId: Snowflake;
  readonly action: 'create' | 'restore' | 'delete' | 'verify';
  readonly type: 'full' | 'incremental' | 'snapshot';
  readonly itemsCount: number;
  readonly sizeBytes: number;
  readonly durationMs: DurationMs;
  readonly success: boolean;
  readonly error?: string;
}

/**
 * System lifecycle event
 */
export interface SystemEvent {
  readonly eventId: Snowflake;
  readonly timestamp: Timestamp;
  readonly type: 'startup' | 'shutdown' | 'restart' | 'reconnect' | 'error' | 'warning';
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly guildId?: GuildId;
}

/**
 * Event type union for pattern matching
 */
export type SecurityEvent = 
  | SecurityActionEvent
  | VelocityEvent
  | ThreatDetectionEvent
  | PunishmentEvent
  | AuditLogEvent
  | ConfigChangeEvent
  | HealthCheckEvent
  | RateLimitEvent
  | IPBanEvent
  | HoneypotEvent
  | InviteEvent
  | BotJoinEvent
  | WebhookEvent
  | MemberJoinEvent
  | SentimentEvent
  | BehaviorScoreEvent
  | BackupEvent
  | SystemEvent;

/**
 * Event handler type
 */
export type EventHandler<E extends SecurityEvent = SecurityEvent> = (
  event: E
) => Promise<Result<void, Error>>;

/**
 * Event bus interface
 */
export interface EventBus {
  publish<E extends SecurityEvent>(event: E): Promise<void>;
  subscribe(
    eventType: string,
    handler: EventHandler
  ): () => void;
  subscribeAll(handler: EventHandler): () => void;
}

/**
 * Event store interface for persistence
 */
export interface EventStore {
  append(event: SecurityEvent): Promise<Result<void, Error>>;
  getByCorrelationId(correlationId: string): Promise<Result<SecurityEvent[], Error>>;
  getByGuildId(guildId: GuildId, limit?: number): Promise<Result<SecurityEvent[], Error>>;
  getByType(type: string, limit?: number): Promise<Result<SecurityEvent[], Error>>;
  getByTimeRange(start: Timestamp, end: Timestamp): Promise<Result<SecurityEvent[], Error>>;
}

/**
 * Helper functions for creating events
 */

export function createSecurityActionEvent(params: Omit<SecurityActionEvent, 'eventId' | 'timestamp' | 'correlationId'>): SecurityActionEvent {
  return {
    ...params,
    eventId: crypto.randomUUID() as Snowflake,
    timestamp: Date.now() as Timestamp,
    correlationId: crypto.randomUUID()
  };
}

export function createVelocityEvent(params: Omit<VelocityEvent, 'eventId' | 'timestamp' | 'correlationId'>): VelocityEvent {
  return {
    ...params,
    eventId: crypto.randomUUID() as Snowflake,
    timestamp: Date.now() as Timestamp,
    correlationId: crypto.randomUUID()
  };
}

export function createThreatDetectionEvent(params: Omit<ThreatDetectionEvent, 'eventId' | 'timestamp' | 'correlationId'>): ThreatDetectionEvent {
  return {
    ...params,
    eventId: crypto.randomUUID() as Snowflake,
    timestamp: Date.now() as Timestamp,
    correlationId: crypto.randomUUID()
  };
}

export function createPunishmentEvent(params: Omit<PunishmentEvent, 'eventId' | 'timestamp' | 'correlationId'>): PunishmentEvent {
  return {
    ...params,
    eventId: crypto.randomUUID() as Snowflake,
    timestamp: Date.now() as Timestamp,
    correlationId: crypto.randomUUID()
  };
}

export function createHealthCheckEvent(params: Omit<HealthCheckEvent, 'eventId' | 'timestamp' | 'correlationId'>): HealthCheckEvent {
  return {
    ...params,
    eventId: crypto.randomUUID() as Snowflake,
    timestamp: Date.now() as Timestamp,
    correlationId: crypto.randomUUID()
  };
}

export function createSystemEvent(params: Omit<SystemEvent, 'eventId' | 'timestamp'>): SystemEvent {
  return {
    ...params,
    eventId: crypto.randomUUID() as Snowflake,
    timestamp: Date.now() as Timestamp
  };
}