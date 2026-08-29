/**
 * Custom Error Classes
 * 
 * Structured error types for better error handling and debugging.
 */

export class SecurityError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SecurityError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConfigurationError extends SecurityError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', 'critical', context);
    this.name = 'ConfigurationError';
  }
}

export class PermissionError extends SecurityError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'PERMISSION_DENIED', 'high', context);
    this.name = 'PermissionError';
  }
}

export class RateLimitError extends SecurityError {
  constructor(
    message: string,
    public readonly retryAfter: number,
    context?: Record<string, unknown>
  ) {
    super(message, 'RATE_LIMITED', 'medium', context);
    this.name = 'RateLimitError';
  }
}

export class TokenError extends SecurityError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'TOKEN_ERROR', 'critical', context);
    this.name = 'TokenError';
  }
}

export class AuditLogError extends SecurityError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AUDIT_LOG_ERROR', 'high', context);
    this.name = 'AuditLogError';
  }
}

export class DiscordApiError extends SecurityError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly discordCode?: number,
    context?: Record<string, unknown>
  ) {
    super(message, 'DISCORD_API_ERROR', 'high', context);
    this.name = 'DiscordApiError';
  }
}

export class ValidationError extends SecurityError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 'medium', context);
    this.name = 'ValidationError';
  }
}

export class StateError extends SecurityError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'STATE_ERROR', 'high', context);
    this.name = 'StateError';
  }
}

export class ModuleError extends SecurityError {
  constructor(
    message: string,
    public readonly moduleName: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'MODULE_ERROR', 'high', { moduleName, ...context });
    this.name = 'ModuleError';
  }
}

export class ShardError extends SecurityError {
  constructor(message: string, public readonly shardId?: number, context?: Record<string, unknown>) {
    super(message, 'SHARD_ERROR', 'critical', { shardId, ...context });
    this.name = 'ShardError';
  }
}

export class DatabaseError extends SecurityError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'DATABASE_ERROR', 'critical', context);
    this.name = 'DatabaseError';
  }
}

export class EncryptionError extends SecurityError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'ENCRYPTION_ERROR', 'critical', context);
    this.name = 'EncryptionError';
  }
}

export class QuotaExhaustedError extends SecurityError {
  constructor(message: string, public readonly service: string, context?: Record<string, unknown>) {
    super(message, 'QUOTA_EXHAUSTED', 'high', { service, ...context });
    this.name = 'QuotaExhaustedError';
  }
}

/** Type guard for SecurityError */
export function isSecurityError(error: unknown): error is SecurityError {
  return error instanceof SecurityError;
}

/** Extract error code from any error */
export function getErrorCode(error: unknown): string {
  if (isSecurityError(error)) return error.code;
  if (error instanceof Error) return 'UNKNOWN_ERROR';
  return 'NON_ERROR_THROWN';
}

/** Extract severity from any error */
export function getErrorSeverity(error: unknown): 'low' | 'medium' | 'high' | 'critical' {
  if (isSecurityError(error)) return error.severity;
  return 'medium';
}

/** Format error for logging */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack || ''}`;
  }
  return String(error);
}