import crypto from "crypto";

export type LogLevel = "debug" | "info" | "warn" | "error" | "critical";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  message: string;
  reqId?: string;
  ip?: string;
  userId?: string;
  guildId?: string;
  details?: any;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  critical: 4,
};

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

function redactSecrets(text: string): string {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(/(ghp_[a-zA-Z0-9]{36})/g, "ghp_***REDACTED***")
    .replace(/(AIzaSy[a-zA-Z0-9_-]{33})/g, "AIzaSy***REDACTED***")
    .replace(/((?:Bot\s+)?M[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,38})/g, "[DISCORD_TOKEN_REDACTED]")
    .replace(/("adminKey"|"password"|"secret"|"admin_key")\s*:\s*"[^"]+"/gi, '$1:"***REDACTED***"');
}

export function structuredLog(context: {
  level?: LogLevel;
  event?: string;
  reqId?: string;
  ip?: string;
  userId?: string;
  guildId?: string;
  details?: any;
}, message: string) {
  const level = context.level || "info";
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) {
    return;
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    event: context.event || "general",
    message: redactSecrets(message),
    reqId: context.reqId,
    ip: context.ip,
    userId: context.userId,
    guildId: context.guildId,
    details: context.details ? redactSecrets(JSON.stringify(context.details)) : undefined,
  };

  const output = JSON.stringify(entry);
  switch (level) {
    case "debug":
      console.debug(output);
      break;
    case "info":
      console.info(output);
      break;
    case "warn":
      console.warn(output);
      break;
    case "error":
      console.error(output);
      break;
    case "critical":
      console.error(`[CRITICAL] ${output}`);
      break;
  }
}

let reqIdCounter = 0;
export function generateReqId(): string {
  reqIdCounter++;
  return `${Date.now().toString(36)}-${reqIdCounter.toString(36)}`;
}
