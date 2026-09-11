/**
 * Branded Types for Security-Critical Identifiers
 * 
 * These types provide compile-time guarantees that IDs are used correctly
 * and prevent accidental mixing of different identifier types.
 */

declare const __brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type UserId = Brand<string, 'UserId'>;
export type GuildId = Brand<string, 'GuildId'>;
export type ChannelId = Brand<string, 'ChannelId'>;
export type RoleId = Brand<string, 'RoleId'>;
export type MessageId = Brand<string, 'MessageId'>;
export type WebhookId = Brand<string, 'WebhookId'>;
export type InviteCode = Brand<string, 'InviteCode'>;
export type IntegrationId = Brand<string, 'IntegrationId'>;
export type ApplicationId = Brand<string, 'ApplicationId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type AuditLogEntryId = Brand<string, 'AuditLogEntryId'>;
export type BanId = Brand<string, 'BanId'>;
export type EmojiId = Brand<string, 'EmojiId'>;
export type StickerId = Brand<string, 'StickerId'>;
export type ScheduledEventId = Brand<string, 'ScheduledEventId'>;
export type ThreadId = Brand<string, 'ThreadId'>;
export type SoundboardSoundId = Brand<string, 'SoundboardSoundId'>;
export type AutoModRuleId = Brand<string, 'AutoModRuleId'>;
export type EntitlementId = Brand<string, 'EntitlementId'>;
export type SKUId = Brand<string, 'SKUId'>;
export type SubscriptionId = Brand<string, 'SubscriptionId'>;

/**
 * IP Address branded type with validation
 */
export type IPAddress = Brand<string, 'IPAddress'> & { readonly __isValidated: true };

/**
 * Discord Snowflake branded type
 */
export type Snowflake = Brand<string, 'Snowflake'>;

/**
 * Timestamp branded types
 */
export type Timestamp = Brand<number, 'Timestamp'>;
export type UnixTimestamp = Brand<number, 'UnixTimestamp'>;
export type UnixTimestampMs = Brand<number, 'UnixTimestampMs'>;

/**
 * Duration branded types
 */
export type DurationMs = Brand<number, 'DurationMs'>;
export type DurationSeconds = Brand<number, 'DurationSeconds'>;
export type DurationMinutes = Brand<number, 'DurationMinutes'>;

/**
 * Rate limit branded types
 */
export type RateLimitCount = Brand<number, 'RateLimitCount'>;
export type RateLimitWindow = Brand<number, 'RateLimitWindow'>;

/**
 * Security score branded type (0-100)
 */
export type SecurityScore = Brand<number, 'SecurityScore'> & { readonly __range: [0, 100] };

/**
 * Threat level branded type
 */
export type ThreatLevel = Brand<number, 'ThreatLevel'> & { readonly __range: [0, 5] };

/**
 * Permission bitfield branded type
 */
export type PermissionBitfield = Brand<bigint, 'PermissionBitfield'>;

/**
 * Color branded type (0x000000 - 0xFFFFFF)
 */
export type DiscordColor = Brand<number, 'DiscordColor'> & { readonly __range: [0, 0xFFFFFF] };

/**
 * Type constructors with runtime validation
 */

export function createUserId(id: string): UserId {
  if (!/^\d{17,20}$/.test(id)) {
    throw new Error(`Invalid UserId format: ${id}`);
  }
  return id as UserId;
}

export function createGuildId(id: string): GuildId {
  if (!/^\d{17,20}$/.test(id)) {
    throw new Error(`Invalid GuildId format: ${id}`);
  }
  return id as GuildId;
}

export function createChannelId(id: string): ChannelId {
  if (!/^\d{17,20}$/.test(id)) {
    throw new Error(`Invalid ChannelId format: ${id}`);
  }
  return id as ChannelId;
}

export function createRoleId(id: string): RoleId {
  if (!/^\d{17,20}$/.test(id)) {
    throw new Error(`Invalid RoleId format: ${id}`);
  }
  return id as RoleId;
}

export function createMessageId(id: string): MessageId {
  if (!/^\d{17,20}$/.test(id)) {
    throw new Error(`Invalid MessageId format: ${id}`);
  }
  return id as MessageId;
}

export function createWebhookId(id: string): WebhookId {
  if (!/^\d{17,20}$/.test(id)) {
    throw new Error(`Invalid WebhookId format: ${id}`);
  }
  return id as WebhookId;
}

export function createInviteCode(code: string): InviteCode {
  if (!/^[a-zA-Z0-9]{1,32}$/.test(code)) {
    throw new Error(`Invalid InviteCode format: ${code}`);
  }
  return code as InviteCode;
}

export function createIPAddress(ip: string): IPAddress {
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
    throw new Error(`Invalid IPAddress format: ${ip}`);
  }
  return ip as IPAddress;
}

export function createSnowflake(id: string): Snowflake {
  if (!/^\d{17,20}$/.test(id)) {
    throw new Error(`Invalid Snowflake format: ${id}`);
  }
  return id as Snowflake;
}

export function createTimestamp(ts: number): Timestamp {
  if (ts < 0 || ts > 8640000000000000) {
    throw new Error(`Invalid Timestamp: ${ts}`);
  }
  return ts as Timestamp;
}

export function createUnixTimestamp(ts: number): UnixTimestamp {
  if (ts < 0 || ts > 253402300799) {
    throw new Error(`Invalid UnixTimestamp: ${ts}`);
  }
  return ts as UnixTimestamp;
}

export function createUnixTimestampMs(ts: number): UnixTimestampMs {
  if (ts < 0 || ts > 8640000000000000) {
    throw new Error(`Invalid UnixTimestampMs: ${ts}`);
  }
  return ts as UnixTimestampMs;
}

export function createDurationMs(ms: number): DurationMs {
  if (ms < 0) {
    throw new Error(`Invalid DurationMs: ${ms}`);
  }
  return ms as DurationMs;
}

export function createSecurityScore(score: number): SecurityScore {
  if (score < 0 || score > 100 || !Number.isInteger(score)) {
    throw new Error(`Invalid SecurityScore (0-100): ${score}`);
  }
  return score as SecurityScore;
}

export function createThreatLevel(level: number): ThreatLevel {
  if (level < 0 || level > 5 || !Number.isInteger(level)) {
    throw new Error(`Invalid ThreatLevel (0-5): ${level}`);
  }
  return level as ThreatLevel;
}

export function createDiscordColor(color: number): DiscordColor {
  if (color < 0 || color > 0xFFFFFF || !Number.isInteger(color)) {
    throw new Error(`Invalid DiscordColor (0x000000-0xFFFFFF): ${color}`);
  }
  return color as DiscordColor;
}

/**
 * Type guards for branded types
 */

export function isUserId(value: unknown): value is UserId {
  return typeof value === 'string' && /^\d{17,20}$/.test(value);
}

export function isGuildId(value: unknown): value is GuildId {
  return typeof value === 'string' && /^\d{17,20}$/.test(value);
}

export function isChannelId(value: unknown): value is ChannelId {
  return typeof value === 'string' && /^\d{17,20}$/.test(value);
}

export function isRoleId(value: unknown): value is RoleId {
  return typeof value === 'string' && /^\d{17,20}$/.test(value);
}

export function isMessageId(value: unknown): value is MessageId {
  return typeof value === 'string' && /^\d{17,20}$/.test(value);
}

export function isIPAddress(value: unknown): value is IPAddress {
  if (typeof value !== 'string') return false;
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  // IPv6 regex that handles compressed format (::)
  const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9]))$/;
  return ipv4Regex.test(value) || ipv6Regex.test(value);
}

/**
 * Utility type for extracting branded type from string
 */
export type Unbrand<T> = T extends Brand<infer U, any> ? U : T;

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

/**
 * Async result type
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;