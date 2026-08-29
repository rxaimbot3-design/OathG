/**
 * Structured Logging with Pino
 * 
 * Replaces console.log with structured JSON logging.
 * Supports pretty printing in development, JSON in production.
 * Integrates with Discord bot context for guild/user tracking.
 */

import pino, { Logger, LoggerOptions, DestinationStream } from 'pino';
import { SecurityConfigManager, getSecurityConfig } from '../../config/index.js';

export interface LogContext {
  /** Guild ID for guild-scoped logs */
  guildId?: string;
  /** User ID for user-scoped logs */
  userId?: string;
  /** Channel ID for channel-scoped logs */
  channelId?: string;
  /** Event name for event-scoped logs */
  event?: string;
  /** Module name for module-scoped logs */
  module?: string;
  /** Request ID for request tracing */
  requestId?: string;
  /** Shard ID for sharded deployments */
  shardId?: number;
  /** Additional metadata */
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: number;
  levelName: string;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

/** Extended Pino logger with context methods */
export interface StructuredLogger extends Logger {
  /** Log with context at info level */
  info(context: LogContext, message: string, ...args: any[]): void;
  /** Log with context at warn level */
  warn(context: LogContext, message: string, ...args: any[]): void;
  /** Log with context at error level */
  error(context: LogContext, message: string, ...args: any[]): void;
  /** Log with context at debug level */
  debug(context: LogContext, message: string, ...args: any[]): void;
  /** Log with context at trace level */
  trace(context: LogContext, message: string, ...args: any[]): void;
  /** Log security event */
  security(context: LogContext, message: string, ...args: any[]): void;
  /** Log audit event */
  audit(context: LogContext, message: string, ...args: any[]): void;
  /** Create child logger with bound context */
  child(context: LogContext): StructuredLogger;
}

/** Logger factory options */
export interface LoggerFactoryOptions {
  /** Service name */
  name: string;
  /** Minimum log level */
  level?: string;
  /** Enable pretty printing */
  prettyPrint?: boolean;
  /** Custom destination stream */
  destination?: DestinationStream;
  /** Redact sensitive fields */
  redact?: string[];
  /** Custom serializers */
  serializers?: Record<string, (value: any) => any>;
}

/** Default redact paths */
const DEFAULT_REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-admin-key"]',
  'req.cookies.admin_session_token',
  'context.token',
  'context.password',
  'context.secret',
  'context.key',
  'context.adminKey',
  'context.adminSecret',
  'context.discordToken',
  'context.geminiApiKey',
  'context.githubToken',
  '*.token',
  '*.password',
  '*.secret',
  '*.key',
];

/** Default serializers */
const DEFAULT_SERIALIZERS = {
  err: pino.stdSerializers.err,
  error: pino.stdSerializers.err,
  req: pino.stdSerializers.req,
  res: pino.stdSerializers.res,
  context: (context: LogContext) => {
    // Remove undefined values
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(context)) {
      if (value !== undefined) {
        cleaned[key] = value;
      }
    }
    return cleaned;
  },
};

/**
 * Create a structured logger instance
 */
export function createLogger(options: LoggerFactoryOptions): StructuredLogger {
  const config = getSecurityConfig();
  const logLevel = options.level || config.getDefaults().logging.level;
  const prettyPrint = options.prettyPrint ?? config.getDefaults().logging.prettyPrint;

  const pinoOptions: LoggerOptions = {
    name: options.name,
    level: logLevel,
    redact: { paths: options.redact || DEFAULT_REDACT, censor: '[REDACTED]' },
    serializers: { ...DEFAULT_SERIALIZERS, ...options.serializers },
    base: {
      service: options.name,
      pid: process.pid,
      hostname: process.env.HOSTNAME || 'localhost',
      env: process.env.NODE_ENV || 'development',
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  const destination = options.destination || (prettyPrint ? pino.transport({
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname,service,env',
    },
  }) : process.stdout);

  const logger = pino(pinoOptions, destination) as StructuredLogger;

  // Add custom methods
  const originalInfo = logger.info.bind(logger);
  const originalWarn = logger.warn.bind(logger);
  const originalError = logger.error.bind(logger);
  const originalDebug = logger.debug.bind(logger);
  const originalTrace = logger.trace.bind(logger);

  logger.info = (context: LogContext, message: string, ...args: any[]) => {
    originalInfo({ context }, message, ...args);
  };

  logger.warn = (context: LogContext, message: string, ...args: any[]) => {
    originalWarn({ context }, message, ...args);
  };

  logger.error = (context: LogContext, message: string, ...args: any[]) => {
    const error = args.find(arg => arg instanceof Error) as Error | undefined;
    originalError({ context, error: error ? { name: error.name, message: error.message, stack: error.stack } : undefined }, message, ...args);
  };

  logger.debug = (context: LogContext, message: string, ...args: any[]) => {
    originalDebug({ context }, message, ...args);
  };

  logger.trace = (context: LogContext, message: string, ...args: any[]) => {
    originalTrace({ context }, message, ...args);
  };

  // Security log level (between warn and error)
  logger.security = (context: LogContext, message: string, ...args: any[]) => {
    logger.warn({ ...context, securityEvent: true }, `[SECURITY] ${message}`, ...args);
  };

  // Audit log level (info with audit flag)
  logger.audit = (context: LogContext, message: string, ...args: any[]) => {
    logger.info({ ...context, auditEvent: true }, `[AUDIT] ${message}`, ...args);
  };

  return logger;
}

/** Global logger instance */
let globalLogger: StructuredLogger | null = null;

/** Get or create the global logger */
export function getLogger(name = 'app'): StructuredLogger {
  if (!globalLogger) {
    globalLogger = createLogger({ name });
  }
  return globalLogger;
}

/** Create a module-specific logger */
export function createModuleLogger(moduleName: string): StructuredLogger {
  return createLogger({ name: `app:${moduleName}` }).child({ module: moduleName });
}

/** Create a guild-scoped logger */
export function createGuildLogger(guildId: string, baseLogger?: StructuredLogger): StructuredLogger {
  return (baseLogger || getLogger()).child({ guildId });
}

/** Create a request-scoped logger */
export function createRequestLogger(requestId: string, baseLogger?: StructuredLogger): StructuredLogger {
  return (baseLogger || getLogger()).child({ requestId });
}

/** Create a shard-scoped logger */
export function createShardLogger(shardId: number, baseLogger?: StructuredLogger): StructuredLogger {
  return (baseLogger || getLogger()).child({ shardId });
}

/** Set global logger (for testing) */
export function setLogger(logger: StructuredLogger): void {
  globalLogger = logger;
}

/** Reset global logger */
export function resetLogger(): void {
  globalLogger = null;
}

/** Log levels */
export const LogLevel = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

/** Check if log level is enabled */
export function isLevelEnabled(logger: StructuredLogger, level: LogLevel): boolean {
  return logger.level <= level;
}