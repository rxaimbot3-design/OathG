/**
 * Structured Logging with Pino
 * Provides consistent, structured logging across all modules
 */

import pino, { Logger, Level, LogDescriptor } from "pino";
import { randomUUID } from "crypto";

export interface LogContext {
  module?: string;
  guildId?: string;
  userId?: string;
  channelId?: string;
  traceId?: string;
  [key: string]: any;
}

export interface LoggerConfig {
  level?: Level;
  prettyPrint?: boolean;
  redact?: string[];
  base?: Record<string, any>;
}

class LogManager {
  private static instance: LogManager;
  private logger: Logger;
  private childLoggers = new Map<string, Logger>();

  private constructor(config: LoggerConfig = {}) {
    this.logger = pino({
      level: config.level ?? (process.env.LOG_LEVEL ?? "info"),
      redact: config.redact ?? ["password", "token", "secret", "key", "authorization", "cookie", "apiKey", "api_key"],
      base: {
        service: "discord-bot",
        version: process.env.npm_package_version ?? "1.0.0",
        environment: process.env.NODE_ENV ?? "development",
        ...config.base,
      },
      transport: config.prettyPrint ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      } : undefined,
    });

    // Add global serializers
    this.logger = this.logger.child({
      serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
      },
    });
  }

  static getInstance(config?: LoggerConfig): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager(config);
    }
    return LogManager.instance;
  }

  static resetInstance(): void {
    LogManager.instance = undefined as any;
  }

  getLogger(context?: LogContext): Logger {
    if (!context) return this.logger;

    const key = JSON.stringify(context);
    let child = this.childLoggers.get(key);
    if (!child) {
      child = this.logger.child(context);
      this.childLoggers.set(key, child);
    }
    return child;
  }

  // Create a child logger with trace ID for request tracing
  getRequestLogger(traceId?: string, context?: LogContext): Logger {
    return this.getLogger({
      traceId: traceId ?? randomUUID(),
      ...context,
    });
  }

  // Convenience methods for common log levels
  trace(context: LogContext, msg: string, ...args: any[]): void {
    this.getLogger(context).trace(msg, ...args);
  }

  debug(context: LogContext, msg: string, ...args: any[]): void {
    this.getLogger(context).debug(msg, ...args);
  }

  info(context: LogContext, msg: string, ...args: any[]): void {
    this.getLogger(context).info(msg, ...args);
  }

  warn(context: LogContext, msg: string, ...args: any[]): void {
    this.getLogger(context).warn(msg, ...args);
  }

  error(context: LogContext, msg: string, ...args: any[]): void {
    this.getLogger(context).error(msg, ...args);
  }

  fatal(context: LogContext, msg: string, ...args: any[]): void {
    this.getLogger(context).fatal(msg, ...args);
  }

  // Structured logging for security events
  securityEvent(event: string, context: LogContext, details?: any): void {
    this.getLogger({ ...context, eventType: "security" }).warn({
      event,
      ...details,
    }, `Security event: ${event}`);
  }

  // Structured logging for audit events
  auditEvent(event: string, context: LogContext, details?: any): void {
    this.getLogger({ ...context, eventType: "audit" }).info({
      event,
      ...details,
    }, `Audit: ${event}`);
  }

  // Structured logging for performance metrics
  perfEvent(operation: string, durationMs: number, context: LogContext, details?: any): void {
    this.getLogger({ ...context, eventType: "performance" }).info({
      operation,
      durationMs,
      ...details,
    }, `Performance: ${operation} took ${durationMs}ms`);
  }

  // Get raw pino logger for advanced usage
  getRawLogger(): Logger {
    return this.logger;
  }

  // Flush logs (useful for graceful shutdown)
  async flush(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.flush((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

// Export singleton instance getter
export const log = LogManager.getInstance();

// Export convenience functions
export function getLogger(context?: LogContext): Logger {
  return LogManager.getInstance().getLogger(context);
}

export function getRequestLogger(traceId?: string, context?: LogContext): Logger {
  return LogManager.getInstance().getRequestLogger(traceId, context);
}

// Module-specific logger factory
export function createModuleLogger(moduleName: string): Logger {
  return LogManager.getInstance().getLogger({ module: moduleName });
}