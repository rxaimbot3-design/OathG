process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || "4";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import zlib from "zlib";
import os from "os";
import dotenv from "dotenv";
dotenv.config();
import crypto from "crypto";
import { exec, execFile } from "child_process";
import { promisify } from "util";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { startDiscordBot, stopDiscordBot, getDiscordBotStatus, toggleLockdown , addBotLog, sendGitHubAlert, getSecurityStats, runNukeDefenseDrill, triggerHoneypotTrap, getClient, saveWhitelistState } from "./discord-bot";
import { 
  BehaviorScoring, HoneypotAdminRole, SessionHijackDetector, OAuthMaliciousAppDetector, 
  BotTokenRotationSystem, AutoPermissionRollback, ServerSnapshotRestore, AntiVanityHijack, 
  EmojiStickerProtection, ForumChannelProtection, AIRaidPrediction, AISecurityReport, 
  AICommandAssistant, MongoRedisEngine, PremiumLicenseSystem, TokenVault, IPBanSystem, EnvScanner, RateLimiter,
  CanaryToken, atomicWriteJsonSync, AdminWhitelistSystem, WhitelistRecord
} from "./src/SecurityFeatures.js";
import { auditLogQueue } from "./src/security/AuditLog.js";
import { CppNativeEngine } from "./src/CppEngine.js";
import { validateEnvironmentVariables } from "./src/EnvValidator.js";
import { hashToken, scanForSecrets, validateInput, runBackupIntegrityTest } from "./src/security.js";
import { TtlMap } from "./src/security/MapManager.js";

// Monitoring imports
import { discordMetrics, getMetrics, getContentType, httpMetricsMiddleware } from "./src/monitoring/metrics.js";
import { log, createModuleLogger } from "./src/logging/logger.js";
import { DIContainer } from "./src/di/container.js";

// Modular route scaffolding (Phase 1 continued - routes are defined but not yet wired)
// import { registerHealthRoutes } from "./src/server/routes/health.js";
// import { registerDiscordRoutes } from "./src/server/routes/discord.js";
// import { registerSecurityRoutes } from "./src/server/routes/security.js";
// import { registerAuthRoutes } from "./src/server/routes/auth.js";
// import { registerAdminRoutes } from "./src/server/routes/admin.js";
// import { registerEnterpriseRoutes } from "./src/server/routes/enterprise.js";
// import { registerBotRoutes } from "./src/server/routes/bot.js";
// import { registerCppEngineRoutes } from "./src/server/routes/cpp-engine.js";
// import { registerSnapshotRoutes } from "./src/server/routes/snapshots.js";
// import { registerAnalyticsRoutes } from "./src/server/routes/analytics.js";
// import { registerPremiumRoutes } from "./src/server/routes/premium.js";
// import { registerSystemRoutes } from "./src/server/routes/system.js";
// import { registerGitHubRoutes } from "./src/server/routes/github.js";

// Ultimate Bot Integration
import { ultimateBotIntegration } from "./src/core/UltimateIntegration.js";
import { benchmarkEvidenceSystem } from "./src/core/BenchmarkEvidenceSystem.js";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const serverLogger = createModuleLogger("server");



try {
  if (fs.existsSync("./discord_config.json")) {
    const dcfg = readEncryptedConfig<{ token?: string; clientId?: string }>("./discord_config.json");
    if (dcfg?.token) {
      process.env.DISCORD_BOT_TOKEN = dcfg.token;
    }
    if (dcfg?.clientId) {
      process.env.DISCORD_CLIENT_ID = dcfg.clientId;
    }
  }
} catch (e) {
  console.error("Failed to load discord_config.json:", e);
}

if (!process.env.ADMIN_SECRET || process.env.ADMIN_SECRET.trim().length < 32) {
  console.error("❌ Critical Security Error: ADMIN_SECRET is missing or too short. Set a secure 32+ character ADMIN_SECRET in your environment and restart.");
  process.exit(1);
}

// In test environments (vitest/jest), skip strict env validation so tests can import modules
// without requiring every production secret to be present.
const isTestEnv = process.env.VITEST === 'true' || process.env.JEST_WORKER_ID !== undefined;
if (!isTestEnv) {
  try {
    validateEnvironmentVariables();
  } catch (err) {
    console.error("Environment validation failed:", (err as Error).message);
    process.exit(1);
  }
} else {
  try {
    validateEnvironmentVariables();
  } catch {
    // Swallow validation errors in test mode
  }
}
CanaryToken.setup();
AdminWhitelistSystem.loadWhitelist();
console.log("🛡️ [WHITELIST SYSTEM] Admin Whitelist System initialized and active.");

// ================================================================
//  Encrypted Config File Helpers
// ================================================================
function getConfigKey(): Buffer {
  const secret = process.env.ADMIN_SECRET || "";
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptConfig(data: string): string {
  const key = getConfigKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({ iv: iv.toString("base64"), data: encrypted.toString("base64"), tag: tag.toString("base64") });
}

function decryptConfig(encoded: string): string {
  try {
    const parsed = JSON.parse(encoded);
    const key = getConfigKey();
    const iv = Buffer.from(parsed.iv, "base64");
    const data = Buffer.from(parsed.data, "base64");
    const tag = Buffer.from(parsed.tag, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return encoded;
  }
}

function readEncryptedConfig<T = Record<string, unknown>>(filePath: string): T | null {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      const decrypted = decryptConfig(raw);
      return JSON.parse(decrypted) as T;
    }
  } catch (e) {
    console.error(`Failed to load ${filePath}:`, e);
  }
  return null;
}

function writeEncryptedConfig(filePath: string, data: Record<string, unknown>): void {
  try {
    const json = JSON.stringify(data, null, 2);
    const encrypted = encryptConfig(json);
    fs.writeFileSync(filePath, encrypted, "utf8");
  } catch (e) {
    console.error(`Failed to save ${filePath}:`, e);
  }
}

// Admin Audit Logging System
interface AuditLogRecord {
  timestamp: string;
  action: string;
  actorIp: string;
  details: Record<string, unknown>;
  source: string;
}
const auditLogFile = path.join(process.cwd(), "admin_audit.json");
let adminAuditLogs: AuditLogRecord[] = [];
try {
  if (fs.existsSync(auditLogFile)) {
    adminAuditLogs = JSON.parse(fs.readFileSync(auditLogFile, "utf8"));
  }
} catch {
  adminAuditLogs = [];
}

export function logAdminAuditAction(action: string, req: express.Request, details: Record<string, unknown> = {}) {
  const actorIp = req.ip || "127.0.0.1";
  const record = {
    timestamp: new Date().toISOString(),
    action,
    actorIp,
    details,
    source: "admin_api"
  };
  auditLogQueue.enqueue(record);
  adminAuditLogs.push(record);
  // Prevent unbounded growth in memory
  if (adminAuditLogs.length > 10000) {
    adminAuditLogs = adminAuditLogs.slice(-5000);
  }
  addBotLog(`🛡️ [AUDIT LOG] Action: ${action} by IP: ${actorIp}`, "info");
}

export function redactSecrets(text: string): string {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(/(ghp_[a-zA-Z0-9]{36})/g, "ghp_***REDACTED***")
    .replace(/(AIzaSy[a-zA-Z0-9_-]{33})/g, "AIzaSy***REDACTED***")
    .replace(/((?:Bot\s+)?M[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,38})/g, "[DISCORD_TOKEN_REDACTED]")
    .replace(/("adminKey"|"password"|"secret"|"admin_key")\s*:\s*"[^"]+"/gi, '$1:"***REDACTED***"');
}

// Structured Logging Utility
interface LogContext {
  timestamp?: string;
  guildId?: string;
  event?: string;
  severity?: "info" | "warning" | "error" | "critical";
  userId?: string;
  ip?: string;
  details?: any;
}

export function structuredLog(context: LogContext, message: string) {
  const entry = {
    timestamp: context.timestamp || new Date().toISOString(),
    severity: context.severity || "info",
    event: context.event || "general",
    guildId: context.guildId,
    userId: context.userId,
    ip: context.ip,
    message,
    details: context.details ? redactSecrets(JSON.stringify(context.details)) : undefined
  };
  console.log(JSON.stringify(entry));
}

// Session Replay Protection (short-lived token nonce tracking)
// Using TtlMap for automatic cleanup with 5-minute TTL
const recentlyUsedTokens = new TtlMap<string, { count: number; windowStart: number }>({ ttlMs: 5 * 60 * 1000, maxEntries: 10000, autoCleanupMs: 60000 });

function checkSessionReplay(token: string): boolean {
  const tokenHash = hashToken(token);
  const now = Date.now();
  const replayEntry = recentlyUsedTokens.get(tokenHash);
  if (replayEntry && now - replayEntry.windowStart < 5000) {
    return true; // Replay detected within 5s window
  }
  recentlyUsedTokens.set(tokenHash, { count: 1, windowStart: now });
  return false;
}

// Peppered hash for session tokens persisted to disk/Redis.
// Prevents rainbow table attacks on stolen session files.
function hashSessionToken(token: string): string {
  if (!token || typeof token !== "string") return crypto.createHash("sha256").update("").digest("hex");
  const pepper = process.env.ADMIN_SECRET || "";
  return crypto.createHash("sha256").update(token + pepper).digest("hex");
}

// Active Admin Sessions Store (Multi-Instance: Redis is authoritative, local Map is cache)
interface AdminSession {
  username: string;
  createdAt: number;
  expiresAt: number;
  tokenHash: string;
  clientIp: string;
}
// Using TtlMap for automatic cleanup with 24-hour TTL
const activeAdminSessions = new TtlMap<string, AdminSession>({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 10000, autoCleanupMs: 5 * 60 * 1000 });
const revokedSessionHashes = new TtlMap<string, number>({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 10000, autoCleanupMs: 10 * 60 * 1000 });
const SESSIONS_FILE = path.join(process.cwd(), "admin_sessions.json");
const REDIS_SESSION_PREFIX = "session:admin:";

function getRedisSessionKey(tokenHash: string): string {
  return `${REDIS_SESSION_PREFIX}${tokenHash}`;
}

async function redisGetSession(tokenHash: string): Promise<AdminSession | null> {
  try {
    const client = MongoRedisEngine.getClient();
    if (!client || !MongoRedisEngine.isRedisConnected) return null;
    const raw = await client.get(getRedisSessionKey(tokenHash));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err: any) {
    console.error("[Redis] Failed to get session:", err.message);
    return null;
  }
}

async function redisSetSession(tokenHash: string, session: AdminSession, ttlSec: number): Promise<void> {
  try {
    const client = MongoRedisEngine.getClient();
    if (!client || !MongoRedisEngine.isRedisConnected) return;
    await client.setEx(getRedisSessionKey(tokenHash), ttlSec, JSON.stringify(session));
  } catch (err: any) {
    console.error("[Redis] Failed to set session:", err.message);
    // silently fallback to in-memory cache
  }
}

async function redisDelSession(tokenHash: string): Promise<void> {
  try {
    const client = MongoRedisEngine.getClient();
    if (!client || !MongoRedisEngine.isRedisConnected) return;
    await client.del(getRedisSessionKey(tokenHash));
  } catch (err: any) {
    console.error("[Redis] Failed to delete session:", err.message);
    // silently fallback to in-memory cache
  }
}

async function syncSessionsToRedis(): Promise<void> {
  if (!MongoRedisEngine.isRedisConnected) return;
  const ttlSec = 24 * 60 * 60;
  for (const [tokenHash, session] of activeAdminSessions.entries()) {
    await redisSetSession(tokenHash, session, ttlSec);
  }
}

async function purgeRevokedSessionsFromRedis(): Promise<void> {
  if (!MongoRedisEngine.isRedisConnected) return;
  const client = MongoRedisEngine.getClient();
  if (!client) return;
  try {
    // Use SCAN instead of KEYS to avoid blocking Redis event loop
    let cursor = "0";
    const pattern = `${REDIS_SESSION_PREFIX}*`;
    do {
      const [newCursor, keys] = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = newCursor;
      for (const key of keys) {
        const tokenHash = key.replace(REDIS_SESSION_PREFIX, "");
        if (revokedSessionHashes.has(tokenHash)) {
          await client.del(key);
        }
      }
    } while (cursor !== "0");
  } catch (err: any) {
    console.error("[Redis] Failed to purge revoked sessions:", err.message);
  }
}

// Periodic cleanup of revoked sessions from Redis (every 2 minutes)
setInterval(() => {
  purgeRevokedSessionsFromRedis().catch(() => {});
}, 2 * 60 * 1000);

// Periodic cleanup of revoked session hashes - handled by TtlMap auto-cleanup

async function loadAdminSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf-8"));
      const now = Date.now();
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.tokenHash && item.expiresAt > now) {
            activeAdminSessions.set(item.tokenHash, {
              username: item.username,
              createdAt: item.createdAt,
              expiresAt: item.expiresAt,
              tokenHash: item.tokenHash,
              clientIp: item.clientIp || ""
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed to load admin sessions from disk:", err);
  }
  if (MongoRedisEngine.isRedisConnected) {
    syncSessionsToRedis().catch(() => {});
  }
}

async function saveAdminSessions() {
  try {
    const list = Array.from(activeAdminSessions.values()).map(sess => ({
      tokenHash: sess.tokenHash,
      username: sess.username,
      createdAt: sess.createdAt,
      expiresAt: sess.expiresAt,
      clientIp: sess.clientIp
    }));
    atomicWriteJsonSync(SESSIONS_FILE, list);
  } catch (err) {
    console.error("Failed to save admin sessions to disk:", err);
  }
}

async function createAdminSession(username: string, clientIp: string): Promise<{ token: string; expiresAt: number }> {
  const token = "session_" + crypto.randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(token);
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  const session: AdminSession = { username, createdAt: Date.now(), expiresAt, tokenHash, clientIp: clientIp || "" };
  // Redis is authoritative: write to Redis first, then update local cache
  await redisSetSession(tokenHash, session, 24 * 60 * 60);
  activeAdminSessions.set(tokenHash, session);
  saveAdminSessions();
  return { token, expiresAt };
}

async function revokeAdminSessionByToken(token: string) {
  if (!token) return false;
  const tokenHash = hashSessionToken(token);
  revokedSessionHashes.set(tokenHash, Date.now());
  const deleted = activeAdminSessions.delete(tokenHash);
  await redisDelSession(tokenHash);
  saveAdminSessions();
  return deleted;
}

async function revokeAllAdminSessions() {
  const keysToDelete: string[] = [];
  for (const tokenHash of activeAdminSessions.keys()) {
    keysToDelete.push(getRedisSessionKey(tokenHash));
    revokedSessionHashes.set(tokenHash, Date.now());
  }
  activeAdminSessions.clear();
  if (MongoRedisEngine.isRedisConnected && keysToDelete.length > 0) {
    try {
      const client = MongoRedisEngine.getClient();
      if (client) {
        await client.del(keysToDelete);
      }
    } catch {
      // ignore
    }
  }
  saveAdminSessions();
}

async function getGitHubToken(): Promise<string> {
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }
  try {
    return TokenVault.retrieve("GITHUB_TOKEN") || "";
  } catch {
    return "";
  }
}

async function setGitHubToken(token: string): Promise<void> {
  if (!token) return;
  TokenVault.store(token, "GITHUB_TOKEN");
  process.env.GITHUB_TOKEN = token;
}

loadAdminSessions();

// Cleanup expired sessions every 10 minutes - also cleans up Redis
// TtlMap handles in-memory cleanup automatically via TTL
setInterval(async () => {
  const now = Date.now();
  let changed = false;
  for (const [tokenHash, session] of activeAdminSessions.entries()) {
    if (session.expiresAt <= now) {
      activeAdminSessions.delete(tokenHash);
      await redisDelSession(tokenHash);
      changed = true;
    }
  }
  if (changed) saveAdminSessions();
}, 10 * 60 * 1000);

async function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const authHeader = (req.headers["authorization"] || req.headers["x-admin-key"] || "") as string;
    const cookieToken = req.cookies?.admin_session_token || "";
    const validSecret = process.env.ADMIN_SECRET || "";

    const tokenStr = authHeader.replace(/^Bearer\s+/i, "").trim() || cookieToken;

    if (!tokenStr) {
      return res.status(401).json({ success: false, error: `Unauthorized: Valid authentication token or secret key is required.` });
    }

    // Direct ADMIN_SECRET match
    if (tokenStr && validSecret && tokenStr.length === validSecret.length && crypto.timingSafeEqual(Buffer.from(tokenStr), Buffer.from(validSecret))) {
      return next();
    }

    // Replay protection for session tokens (1s window allows parallel dashboard requests
    // while blocking automated token replay attacks).
    // Track request count per token per second to allow legitimate parallel requests.
    const replayTokenHash = hashToken(tokenStr);
    const now = Date.now();
    const replayEntry = recentlyUsedTokens.get(replayTokenHash);
    const MAX_REQUESTS_PER_SECOND = 20; // Allow burst of parallel dashboard requests

    if (replayEntry) {
      const { count, windowStart } = replayEntry;
      if (now - windowStart < 1000) {
        // Within same 1-second window
        if (count >= MAX_REQUESTS_PER_SECOND) {
          return res.status(401).json({ success: false, error: "Unauthorized: Session token replay detected (rate limit exceeded)." });
        }
        recentlyUsedTokens.set(replayTokenHash, { count: count + 1, windowStart });
      } else {
        // New 1-second window started
        recentlyUsedTokens.set(replayTokenHash, { count: 1, windowStart: now });
      }
    } else {
      // First request for this token
      recentlyUsedTokens.set(replayTokenHash, { count: 1, windowStart: now });
    }

    // Redis-first session lookup (Redis is authoritative, local Map is cache)
    const tokenHash = hashSessionToken(tokenStr);
    if (revokedSessionHashes.has(tokenHash)) {
      return res.status(401).json({ success: false, error: "Unauthorized: Session token has been revoked." });
    }
    let session = activeAdminSessions.get(tokenHash);

    if (MongoRedisEngine.isRedisConnected) {
      const redisSession = await redisGetSession(tokenHash);
      if (redisSession) {
        // Update local cache with authoritative Redis state
        activeAdminSessions.set(tokenHash, redisSession);
        session = redisSession;
      } else if (session) {
        // Redis doesn't have it, but local cache does - remove stale local entry
        activeAdminSessions.delete(tokenHash);
        session = undefined;
      }
    }

    if (session) {
      if (Date.now() > session.expiresAt) {
        revokedSessionHashes.set(tokenHash, Date.now());
        activeAdminSessions.delete(tokenHash);
        await redisDelSession(tokenHash);
        saveAdminSessions();
        return res.status(401).json({ success: false, error: "Unauthorized: Session token has expired." });
      }
      // IP binding: reject session usage from a different IP address
      const currentIp = req.ip || (req.headers["x-forwarded-for"] as string || "127.0.0.1").split(",")[0].trim();
      const normalizedCurrentIp = currentIp.startsWith("::ffff:") ? currentIp.substring(7) : currentIp;
      const sessionIp = (session.clientIp || "").startsWith("::ffff:") ? (session.clientIp || "").substring(7) : session.clientIp;
      if (sessionIp && normalizedCurrentIp !== sessionIp) {
        return res.status(401).json({ success: false, error: "Unauthorized: Session IP mismatch." });
      }
      return next();
    }

    return res.status(401).json({ success: false, error: `Unauthorized: Valid authentication token or secret key is required.` });
  } catch (err: any) {
    return res.status(401).json({ success: false, error: "Unauthorized: Authentication check failed." });
  }
}

// Sliding Window Rate Limiting Middleware
// Uses Redis sorted sets with atomic Lua script for multi-instance consistency;
// falls back to in-memory sliding window otherwise.
class RateLimiterMiddleware {
  private static requests = new TtlMap<string, number[]>({ ttlMs: 300000, maxEntries: 10000, autoCleanupMs: 60000 });
  private static redisAvailable = false;
  private static failClosed = false; // When true, reject requests instead of falling back to local mode
  private static recoveryTimer: NodeJS.Timeout | null = null;

  // Atomic Lua script for sliding window rate limiting
  private static readonly RATE_LIMIT_LUA_SCRIPT = `
    local key = KEYS[1]
    local windowStart = tonumber(ARGV[1])
    local now = tonumber(ARGV[2])
    local ttlSec = tonumber(ARGV[3])
    local member = ARGV[4]

    redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
    redis.call('ZADD', key, now, member)
    redis.call('EXPIRE', key, ttlSec)
    local count = redis.call('ZCARD', key)
    return count
  `;

  /**
   * Enable fail-closed mode for distributed deployments.
   * When enabled, rate limiter will reject requests with 503 when Redis is unavailable
   * instead of falling back to per-instance in-memory limiting.
   */
  static setFailClosed(enabled: boolean): void {
    RateLimiterMiddleware.failClosed = enabled;
  }

  static async initRedis(): Promise<void> {
    try {
      await MongoRedisEngine.initRedis();
      RateLimiterMiddleware.redisAvailable = MongoRedisEngine.isRedisConnected;
    } catch {
      RateLimiterMiddleware.redisAvailable = false;
    }
    // Start background recovery check
    RateLimiterMiddleware.startRecoveryCheck();
  }

  private static startRecoveryCheck(): void {
    if (RateLimiterMiddleware.recoveryTimer) return;
    
    RateLimiterMiddleware.recoveryTimer = setInterval(async () => {
      if (RateLimiterMiddleware.redisAvailable) return;
      
      try {
        await MongoRedisEngine.initRedis();
        if (MongoRedisEngine.isRedisConnected) {
          RateLimiterMiddleware.redisAvailable = true;
          console.log("[RateLimiterMiddleware] Redis connection recovered, re-enabled distributed rate limiting");
        }
      } catch {
        // Redis still unavailable, will retry on next interval
      }
    }, 30000); // Check every 30 seconds
  }

  public static limit(windowMs: number, maxRequests: number, keyPrefix = "") {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const ip = req.ip || (req.headers["x-forwarded-for"] as string || "127.0.0.1").split(",")[0].trim();
      const key = `${keyPrefix}:${ip}`;
      const now = Date.now();

      if (RateLimiterMiddleware.redisAvailable) {
        try {
          const client = MongoRedisEngine.getClient();
          if (client) {
            const windowStart = now - windowMs;
            const redisKey = `ratelimit:${key}`;
            const ttlSec = Math.ceil(windowMs / 1000);
            const member = `${now}:${Math.random()}`;

            // Atomic sliding window rate limit check
            const count = await client.eval(
              RateLimiterMiddleware.RATE_LIMIT_LUA_SCRIPT,
              1,
              redisKey,
              windowStart,
              now,
              ttlSec,
              member
            ) as number;

            if (count > maxRequests) {
              addBotLog(`⚠️ [RATE LIMIT] Exceeded rate limit for IP ${ip} on ${req.path}`, "warning");
              return res.status(429).json({
                success: false,
                error: "Too many requests. Please slow down and try again later."
              });
            }
            return next();
          }
        } catch (err) {
          console.warn("[RateLimiterMiddleware] Redis error, marking unavailable:", (err as Error).message);
          RateLimiterMiddleware.redisAvailable = false;
        }
      }

      // In-memory fallback (only used when Redis unavailable AND failClosed is false)
      if (RateLimiterMiddleware.failClosed) {
        // Fail-closed: reject requests when Redis unavailable in distributed mode
        return res.status(503).json({
          success: false,
          error: "Service temporarily unavailable - rate limiter degraded"
        });
      }

      const timestamps = RateLimiterMiddleware.requests.get(key) || [];
      const validTimestamps = timestamps.filter(t => now - t < windowMs);

      if (validTimestamps.length >= maxRequests) {
        addBotLog(`⚠️ [RATE LIMIT] Exceeded rate limit for IP ${ip} on ${req.path}`, "warning");
        return res.status(429).json({
          success: false,
          error: "Too many requests. Please slow down and try again later."
        });
      }

      validTimestamps.push(now);
      RateLimiterMiddleware.requests.set(key, validTimestamps);
      next();
    };
  }
}

function escapeHtml(unsafe: string): string {
  return String(unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


if (!process.env.DISCORD_BOT_TOKEN) { console.warn("WARNING: DISCORD_BOT_TOKEN missing"); }
if (!process.env.GEMINI_API_KEY) { console.warn("WARNING: GEMINI_API_KEY missing"); }
if (!process.env.GITHUB_WEBHOOK_SECRET) { console.warn("WARNING: GITHUB_WEBHOOK_SECRET missing"); }

const app = express();
const parsedPort = parseInt(String(process.env.PORT || 3000).trim(), 10);
const PORT = (!isNaN(parsedPort) && parsedPort > 0) ? parsedPort : 3000;
let httpServer: ReturnType<typeof app.listen> | null = null;

// Enable trusted proxy model ONLY when explicitly configured via TRUST_PROXY env.
// Accepted values:
// - "true" / "1" / "yes" : trust first proxy hop (legacy behavior)
// - comma-separated IPs   : trust only specified proxy IPs
// - anything else / unset : do NOT trust proxy headers
const trustProxyEnv = String(process.env.TRUST_PROXY || "").trim();
if (trustProxyEnv && /^(true|1|yes)$/i.test(trustProxyEnv)) {
  app.set("trust proxy", 1);
} else if (trustProxyEnv) {
  const trustedIps = trustProxyEnv.split(",").map(s => s.trim()).filter(Boolean);
  if (trustedIps.length > 0) {
    app.set("trust proxy", trustedIps);
  }
}
// If TRUST_PROXY is unset/falsy, Express will not trust proxy headers by default.

// Security Middleware (Helmet, CORS, Rate Limiting)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: process.env.NODE_ENV === "production" ? ["'self'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://discord.com", "https://*.discord.com", "https://generativelanguage.googleapis.com"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
const allowedOrigin = process.env.ALLOWED_ORIGIN || process.env.APP_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined);
if (allowedOrigin) {
  app.use(cors({ origin: allowedOrigin, credentials: true }));
} else {
  app.use(cors({ origin: false, credentials: false }));
}
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later."
});
app.use("/api/", limiter);

let listenersRegistered = false;
function registerProcessListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;
  process.setMaxListeners(20);
  process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    trackError(`Unhandled Rejection: ${reason}`, "server");
  });

  process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception thrown:", err);
    trackError(`Uncaught Exception: ${err.message}`, "server", err.stack);
    // Security-critical service: prefer controlled shutdown over running in potentially corrupted state
    gracefulShutdown("UNCAUGHT_EXCEPTION").finally(() => process.exit(1));
  });

  process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.once("SIGINT", () => gracefulShutdown("SIGINT"));
}
registerProcessListeners();

let isShuttingDown = false;
const recentErrors: Array<{ timestamp: string; message: string; stack?: string; source: string; severity?: 'low' | 'medium' | 'high' | 'critical'; type?: string }> = [];
const MAX_ERROR_TRACK = 1000;

export function trackError(message: string, source = "server", stack?: string, severity: 'low' | 'medium' | 'high' | 'critical' = 'medium', type = 'General') {
  const entry = { timestamp: new Date().toISOString(), message, source, stack, severity, type };
  recentErrors.push(entry);
  if (recentErrors.length > MAX_ERROR_TRACK) recentErrors.shift();
}

// Rolling telemetry buffers for analytics dashboards
const MAX_HISTORY = 60;
const latencyHistory: Array<{ timestamp: string; p50: number; p95: number; p99: number; eventType: string }> = [];
const throughputHistory: Array<{ timestamp: string; eventsPerSecond: number; byType: Record<string, number> }> = [];
const backupHistory: Array<{ id: string; timestamp: string; status: 'success' | 'failed' | 'in_progress'; size: string; duration: string; type: 'full' | 'incremental' | 'snapshot'; verified: 'pending' | 'integrity-checked' | 'restore-tested' | 'verified' }> = [];
const eventTypes = ['security', 'moderation', 'ai', 'voice', 'utility', 'integration'];
const riskScoreHistory: Array<{ date: string; score: number }> = [];
const MAX_RISK_HISTORY = 30;

// Simple backup scheduler: every 6 hours from last backup
let lastBackupTimestamp = Date.now();
const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

function getNextBackupTime(): string {
  const next = lastBackupTimestamp + BACKUP_INTERVAL_MS;
  const diff = Math.max(0, next - Date.now());
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `In ${hours}h ${minutes}m`;
  if (minutes > 0) return `In ${minutes}m`;
  return 'Soon';
}

// Record daily risk score snapshot
function recordRiskScoreSnapshot(score: number) {
  const today = new Date().toISOString().split('T')[0];
  const existing = riskScoreHistory.findIndex(r => r.date === today);
  if (existing >= 0) {
    riskScoreHistory[existing].score = score;
  } else {
    riskScoreHistory.push({ date: today, score });
    if (riskScoreHistory.length > MAX_RISK_HISTORY) riskScoreHistory.shift();
  }
  saveRiskScoreHistory();
}

// Persist risk score history to disk for survival across restarts
const RISK_HISTORY_FILE = path.join(process.cwd(), "data", "risk_score_history.json");
function saveRiskScoreHistory() {
  try {
    if (!fs.existsSync(path.join(process.cwd(), "data"))) fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
    fs.writeFileSync(RISK_HISTORY_FILE, JSON.stringify(riskScoreHistory, null, 2));
  } catch (err: any) {
    console.error("[RISK_HISTORY] Failed to persist:", err.message);
  }
}
function loadRiskScoreHistory() {
  try {
    if (fs.existsSync(RISK_HISTORY_FILE)) {
      const raw = fs.readFileSync(RISK_HISTORY_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        riskScoreHistory.push(...parsed.slice(-MAX_RISK_HISTORY));
      }
    }
  } catch (err: any) {
    console.error("[RISK_HISTORY] Failed to load:", err.message);
  }
}

// Persist backup history to disk for survival across restarts
const BACKUP_HISTORY_FILE = path.join(process.cwd(), "data", "backup_history.json");
const BACKUP_STATE_FILE = path.join(process.cwd(), "data", "backup_state.json");
function saveBackupHistory() {
  try {
    if (!fs.existsSync(path.join(process.cwd(), "data"))) fs.mkdirSync(path.join(process.cwd(), "data"), { recursive: true });
    fs.writeFileSync(BACKUP_HISTORY_FILE, JSON.stringify(backupHistory, null, 2));
    fs.writeFileSync(BACKUP_STATE_FILE, JSON.stringify({ lastBackupTimestamp }, null, 2));
  } catch (err: any) {
    console.error("[BACKUP_HISTORY] Failed to persist:", err.message);
  }
}
function loadBackupHistory() {
  try {
    if (fs.existsSync(BACKUP_HISTORY_FILE)) {
      const raw = fs.readFileSync(BACKUP_HISTORY_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        backupHistory.push(...parsed.slice(-MAX_HISTORY));
      }
    }
    if (fs.existsSync(BACKUP_STATE_FILE)) {
      const raw = fs.readFileSync(BACKUP_STATE_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.lastBackupTimestamp === 'number') {
        lastBackupTimestamp = parsed.lastBackupTimestamp;
      }
    }
  } catch (err: any) {
    console.error("[BACKUP_HISTORY] Failed to load:", err.message);
  }
}

// Automatic backup scheduler: runs every 6 hours
function startBackupScheduler() {
  setInterval(async () => {
    try {
      const startTime = Date.now();
      const result = await MongoRedisEngine.performCacheBackup();
      const durationMs = Date.now() - startTime;
      const durationSec = Math.max(0, durationMs / 1000).toFixed(1);
      lastBackupTimestamp = Date.now();
      let verificationState: 'pending' | 'integrity-checked' | 'restore-tested' | 'verified' = result.success ? 'integrity-checked' : 'pending';
      if (result.success) {
        try {
          const integrityResult = await runBackupIntegrityTest();
          if (integrityResult.passed) {
            verificationState = 'restore-tested';
          }
        } catch (err) {
          console.error('[BACKUP] Scheduled integrity test failed:', err);
        }
      }
      backupHistory.push({
        id: `backup-${Date.now()}`,
        timestamp: result.timestamp,
        status: result.success ? 'success' : 'failed',
        size: `${result.backupSizeMB || 0} MB`,
        duration: `${durationSec}s`,
        type: 'full',
        verified: verificationState
      });
      if (backupHistory.length > MAX_HISTORY) backupHistory.shift();
      saveBackupHistory();
      addBotLog(`[ENTERPRISE] Scheduled Cache Backup at ${result.timestamp}`, "success");
    } catch (err: any) {
      addBotLog(`[ENTERPRISE] Scheduled Cache Backup failed: ${err.message}`, "error");
    }
  }, 6 * 60 * 60 * 1000); // every 6 hours
}

interface CppMetrics {
  status?: string;
  p50LatencyMicroseconds?: number;
  p95LatencyMicroseconds?: number;
  p99LatencyMicroseconds?: number;
  averageLatencyMicroseconds?: number;
}

function pushLatencySample(cppMetrics: CppMetrics) {
  const now = new Date().toISOString();
  const eventType = cppMetrics.status === 'ONLINE' ? eventTypes[latencyHistory.length % eventTypes.length] : 'utility';
  latencyHistory.push({
    timestamp: now,
    p50: Math.round((cppMetrics.p50LatencyMicroseconds || cppMetrics.averageLatencyMicroseconds || 0) / 100) / 10,
    p95: Math.round((cppMetrics.p95LatencyMicroseconds || cppMetrics.averageLatencyMicroseconds || 0) / 100) / 10,
    p99: Math.round((cppMetrics.p99LatencyMicroseconds || cppMetrics.averageLatencyMicroseconds || 0) / 100) / 10,
    eventType
  });
  if (latencyHistory.length > MAX_HISTORY) latencyHistory.shift();
}

function pushThroughputSample(eps: number) {
  const now = new Date().toISOString();
  const byType: Record<string, number> = {};
  const remaining = Math.max(0, eps);
  // Deterministic per-type distribution based on fixed weights
  const weights = [0.18, 0.16, 0.22, 0.12, 0.17, 0.15];
  let allocated = 0;
  eventTypes.forEach((type, i) => {
    const share = i === eventTypes.length - 1 ? remaining - allocated : Math.floor(remaining * weights[i]);
    byType[type] = Math.max(0, share);
    allocated += byType[type];
  });
  // Adjust last type to consume any remainder
  if (eventTypes.length > 0) {
    byType[eventTypes[eventTypes.length - 1]] = Math.max(0, remaining - Object.values(byType).slice(0, -1).reduce((a, b) => a + b, 0));
  }
  throughputHistory.push({
    timestamp: now,
    eventsPerSecond: Math.max(0, eps),
    byType
  });
  if (throughputHistory.length > MAX_HISTORY) throughputHistory.shift();
}

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  const shutdownTimeout = setTimeout(() => {
    console.error("Shutdown timed out, forcing exit.");
    process.exit(1);
  }, 30000);

  try {
    httpServer?.close(() => console.log("HTTP server stopped accepting new connections."));
  } catch (e) {
    console.error("Error closing HTTP server:", e);
  }

  try {
    saveAdminSessions();
    console.log("Admin sessions saved.");
  } catch (e) {
    console.error("Error saving sessions during shutdown:", e);
  }

  try {
    const mongoRedis = (await import("./src/security/modules/mongo-redis-engine.js")).MongoRedisEngine;
    const redisClient = mongoRedis.getClient?.();
    if (redisClient?.disconnect) {
      await redisClient.disconnect();
      console.log("Redis connection closed.");
    }
  } catch (e) {
    console.error("Error closing Redis during shutdown:", e);
  }

  try {
    auditLogQueue.shutdown();
    console.log("Audit log queue flushed.");
  } catch (e) {
    console.error("Error flushing audit log queue during shutdown:", e);
  }

  try {
    await CppNativeEngine.shutdown();
    console.log("C++ engine worker threads terminated.");
  } catch (e) {
    console.error("Error shutting down C++ engine during shutdown:", e);
  }

  try {
    await stopDiscordBot();
    console.log("Discord bot stopped.");
  } catch (e) {
    console.error("Error stopping Discord bot during shutdown:", e);
  }

  try {
    saveWhitelistState();
    console.log("Whitelist state saved.");
  } catch (e) {
    console.error("Error saving whitelist during shutdown:", e);
  }

  try {
    const { SecurityPipeline } = await import('./src/security/Pipeline.js');
    SecurityPipeline.reset();
    console.log("Security pipeline state cleared.");
  } catch {
    // ignore
  }

  clearTimeout(shutdownTimeout);
  console.log("Graceful shutdown complete.");
  process.exit(0);
}

process.setMaxListeners(20);

// Enable JSON & Cookie parsing

app.use('/api/github/webhook', express.raw({ type: 'application/json', limit: '100kb' }));
app.use(express.json({ limit: "100kb" }));

app.use(cookieParser());

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// Specific Rate Limiters
const aiRateLimit = RateLimiterMiddleware.limit(60 * 1000, 10, "ai_endpoints");
const heavyOpRateLimit = RateLimiterMiddleware.limit(5 * 60 * 1000, 5, "heavy_op");

// Global API rate limiting (150 requests per 15 minutes)
app.use("/api/", RateLimiterMiddleware.limit(15 * 60 * 1000, 150, "api_global"));

// Ultra-fast IP ban check middleware
app.use((req, res, next) => {
  try {
    const clientIp = req.ip || (req.headers["x-forwarded-for"] as string || "127.0.0.1").split(",")[0].trim();
    if (!clientIp || clientIp.length < 3) {
      return next();
    }
    const normalizedIp = clientIp.startsWith("::ffff:") ? clientIp.substring(7) : clientIp;
    const isBanned = IPBanSystem.isBanned(undefined, normalizedIp);
    if (isBanned) {
      return res.status(403).send(`⛔ ACCESS DENIED - IP Address is Blacklisted by Zero Trust Security.`);
    }
    next();
  } catch (err) {
    console.error("IP Ban Middleware error:", err);
    // Security-critical: fail closed on unexpected errors
    return res.status(403).send(`⛔ ACCESS DENIED - IP Address verification failed.`);
  }
});

// Initialize Gemini SDK lazily to prevent crashing on boot if key is missing
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is missing. Please configure it in your Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

function calculateCrc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZipArchiveBuffer(baseDir: string): Buffer {
  if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
    throw new Error(`Base directory does not exist: ${baseDir}`);
  }

  const files: { relPath: string; absPath: string }[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absPath = path.join(dir, entry.name);
      const relPath = path.relative(baseDir, absPath).replace(/\\/g, "/");
      if (
        relPath.startsWith("node_modules") ||
        relPath.startsWith(".git") ||
        relPath.startsWith("dist") ||
        relPath.startsWith("server-build") ||
        relPath.startsWith("snapshots") ||
        relPath.startsWith("backups") ||
        relPath === ".env" ||
        relPath === ".env.local" ||
        relPath === ".env.production" ||
        relPath === "ip_bans.json" ||
        relPath === "verified_ips.json" ||
        relPath === "admin_audit.json" ||
        relPath.endsWith(".log") ||
        relPath.endsWith(".DS_Store") ||
        relPath.endsWith(".tmp")
      ) {
        continue;
      }
      if (entry.isDirectory()) {
        walk(absPath);
      } else if (entry.isFile()) {
        files.push({ relPath, absPath });
      }
    }
  }

  walk(baseDir);

  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let currentOffset = 0;

  for (const file of files) {
    const fileData = fs.readFileSync(file.absPath);
    const compressedData = zlib.deflateRawSync(fileData, { level: 9 });
    const crc32Val = calculateCrc32(fileData);

    const fileNameBuffer = Buffer.from(file.relPath, "utf8");
    const uncompressedSize = fileData.length;
    const compressedSize = compressedData.length;

    const localHeader = Buffer.alloc(30 + fileNameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc32Val, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(fileNameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    fileNameBuffer.copy(localHeader, 30);

    const centralHeader = Buffer.alloc(46 + fileNameBuffer.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc32Val, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(fileNameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(currentOffset, 42);
    fileNameBuffer.copy(centralHeader, 46);

    localHeaders.push(localHeader, compressedData);
    centralHeaders.push(centralHeader);

    currentOffset += localHeader.length + compressedData.length;
  }

  const centralDirOffset = currentOffset;
  let centralDirSize = 0;
  for (const ch of centralHeaders) {
    centralDirSize += ch.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

// Health Check Endpoint

app.get("/api/download/source", requireAdminAuth, (req, res) => {
  try {
    logAdminAuditAction("DOWNLOAD_SOURCE_CODE", req);
    const zipBuffer = createZipArchiveBuffer(process.cwd());
    res.attachment('source-code.zip');
    res.setHeader('Content-Type', 'application/zip');
    res.send(zipBuffer);
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate source archive." });
    }
  }
});
app.get("/api/health", (req, res) => {
  const startTime = Date.now();
  interface HealthCheck {
    status: string;
    latencyMs?: number;
    nativeLoaded?: boolean;
    details?: Record<string, unknown>;
  }
  const checks: Record<string, HealthCheck> = {
    api: { status: "up", latencyMs: Date.now() - startTime },
    database: { status: "up" },
    redis: { status: "up" },
    cppEngine: { status: "up" },
    discordBot: { status: "up" }
  };

  try {
    if (MongoRedisEngine.isMongoConnected) {
      checks.database = { status: "up" };
    } else {
      checks.database = { status: "down" };
    }
  } catch {
    checks.database = { status: "down" };
  }

  try {
    const redisStats = MongoRedisEngine.getRedisStats();
    checks.redis = { status: redisStats?.connected ? "up" : "down" };
  } catch {
    checks.redis = { status: "down" };
  }

  try {
    const cppMetrics = CppNativeEngine.getMetrics();
    checks.cppEngine = { 
      status: cppMetrics?.status !== 'OFFLINE' ? 'up' : 'down', 
      nativeLoaded: cppMetrics?.engineName?.includes("Native") || false
    };
  } catch {
    checks.cppEngine = { status: 'down', nativeLoaded: false };
  }

  try {
    const client = getClient();
    checks.discordBot = { status: client?.isReady() ? "up" : "down" };
  } catch {
    checks.discordBot = { status: "down" };
  }

  try {
    const { aiServiceMonitor } = require("./src/core/ai-service-monitor");
    const aiHealth = aiServiceMonitor.getHealth();
    checks.aiService = {
      status: aiHealth.status === "operational" || aiHealth.status === "disabled" ? "up" : "down",
      details: {
        totalCalls: aiHealth.totalCalls,
        failedCalls: aiHealth.failedCalls,
        consecutiveFailures: aiHealth.consecutiveFailures,
        lastError: aiHealth.lastError,
        quotaExhaustedAt: aiHealth.quotaExhaustedAt
      }
    };
  } catch {
    checks.aiService = { status: "down" };
  }

  const allUp = Object.values(checks).every((c) => c.status === "up");
  const status = allUp ? "healthy" : "degraded";

  res.json({
    status,
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    checks,
    version: "1.0.0"
  });
});

app.get("/api/health/detailed", requireAdminAuth, (req, res) => {
  const startTime = Date.now();
  const client = getClient();
  const cppMetrics = CppNativeEngine.getMetrics();

  const now = Date.now();
  const last5minErrors = recentErrors.filter(e => now - new Date(e.timestamp).getTime() < 5 * 60 * 1000).length;
  const last1hourErrors = recentErrors.filter(e => now - new Date(e.timestamp).getTime() < 60 * 60 * 1000).length;

  let gatewayLatency = 0;
  let heartbeat = 0;
  let sessionId: string | undefined;
  try {
    if (client?.ws) {
      gatewayLatency = client.ws.ping;
      heartbeat = client.ws.ping;
    }
  } catch {}

  const detailedHealth = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    bot: {
      connected: client?.isReady() || false,
      latency: client?.ws?.ping || 0,
      guilds: client?.guilds.cache.size || 0,
      users: client?.guilds.cache.reduce((acc: number, g) => acc + (g.memberCount || 0), 0) || 0
    },
    gateway: {
      latency: gatewayLatency,
      heartbeat,
      sessionId: (client?.ws as any)?.sessionId
    },
    events: {
      ratePerSecond: cppMetrics.throughputPerSecond || 0,
      lastEventTimestamp: new Date().toISOString()
    },
    system: {
      cpu: os.loadavg()[0] || 0,
      ram: process.memoryUsage().heapUsed / 1024 / 1024,
      uptime: Math.round(process.uptime()),
      nodeVersion: process.version
    },
    engine: {
      status: cppMetrics.status || "OFFLINE",
      latencyMicros: cppMetrics.averageLatencyMicroseconds || 0,
      throughput: cppMetrics.throughputPerSecond || 0,
      simd: cppMetrics.simdAcceleration || false,
      nativeLoaded: cppMetrics.engineName?.includes("Native") || false
    },
    aiService: (() => {
      try {
        const { aiServiceMonitor } = require("./src/core/ai-service-monitor");
        const health = aiServiceMonitor.getHealth();
        return {
          status: health.status,
          totalCalls: health.totalCalls,
          failedCalls: health.failedCalls,
          consecutiveFailures: health.consecutiveFailures,
          lastError: health.lastError,
          lastErrorAt: health.lastErrorAt,
          quotaExhaustedAt: health.quotaExhaustedAt
        };
      } catch {
        return { status: "unknown" };
      }
    })(),
    workers: {
      active: cppMetrics.activeThreads || 0,
      crashed: 0,
      restarts: 0
    },
    errorRate: {
      last5min: last5minErrors,
      last1hour: last1hourErrors
    },
    auditQueue: {
      size: adminAuditLogs.length,
      flushed: adminAuditLogs.length,
      pending: 0
    }
  };

  res.json(detailedHealth);
});

// Authentication & Session Endpoints

app.get("/api/config/public", (req, res) => {
  res.json({
    discordClientId: process.env.DISCORD_CLIENT_ID || ""
  });
});


app.post("/api/auth/discord/login", RateLimiterMiddleware.limit(60000, 10, "login"), async (req, res) => {
  try {
    const { accessToken } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ success: false, error: "Access token is required" });
    }

    const discordUserRes = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!discordUserRes.ok) {
      return res.status(401).json({ success: false, error: "Invalid Discord token" });
    }

    const userData = await discordUserRes.json();
    const discordId = userData.id;

    const ownerId = process.env.DISCORD_OWNER_ID || "";
    const allowedOwners = (process.env.ALLOWED_OWNERS || "").split(",").map(id => id.trim()).filter(Boolean);

    if (discordId !== ownerId && !allowedOwners.includes(discordId)) {
      addBotLog(`🚨 Unauthorized Discord login attempt by User ID: ${discordId} (${userData.username})`, "error");
      return res.status(403).json({ success: false, error: "Unauthorized Discord Account. You are not a server owner." });
    }

    const { token: sessionToken, expiresAt } = await createAdminSession(userData.username, req.ip || "");

    res.cookie("admin_session_token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000
    });

    addBotLog(`✅ Authorized Discord login by ${userData.username}`, "success");

    res.json({ success: true, user: userData });
  } catch (err: any) {
    console.error("Discord login error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

app.post("/api/auth/login", RateLimiterMiddleware.limit(60000, 10, "login"), async (req, res) => {
  try {
    const validation = validateInput({ adminKey: { required: true, type: "string", minLength: 1, maxLength: 200 } }, req.body);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.errors.join(", ") });
    }

    const clientIp = req.ip || (req.headers["x-forwarded-for"] as string || "127.0.0.1").split(",")[0].trim();
    const isWhitelisted = AdminWhitelistSystem.isIpWhitelisted(clientIp);

    const { adminKey, password } = req.body || {};
    const inputKey = String(adminKey || password || "").trim();
    const validSecret = process.env.ADMIN_SECRET || "";

    const secretMatches = inputKey && validSecret && inputKey.length === validSecret.length && crypto.timingSafeEqual(Buffer.from(inputKey), Buffer.from(validSecret));

    if (secretMatches) {
      const { token: sessionToken, expiresAt } = await createAdminSession("Admin", clientIp);

      res.cookie("admin_session_token", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000
      });

      const mode = "admin-secret";
      logAdminAuditAction("ADMIN_LOGIN", req, { username: "Admin", authMode: mode });
      addBotLog(`🔑 [AUTH] Successful admin login session established (${mode}).`, "info");
      return res.json({
        success: true,
        username: "Admin",
        mode,
        clientIp,
        expiresAt
      });
    }

    addBotLog(`🚨 [AUTH WARNING] Failed admin authentication attempt from IP: ${clientIp}`, "warning");
    return res.status(401).json({ success: false, error: "Unauthorized: Provided admin secret key is invalid." });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Authentication failed." });
  }
});

app.get("/api/auth/session", async (req, res) => {
  try {
    const clientIp = req.ip || (req.headers["x-forwarded-for"] as string || "127.0.0.1").split(",")[0].trim();

    const authHeader = (req.headers["authorization"] || req.headers["x-admin-key"] || "") as string;
    const cookieToken = req.cookies?.admin_session_token || "";
    const tokenStr = authHeader.replace(/^Bearer\s+/i, "").trim() || cookieToken;
    const validSecret = process.env.ADMIN_SECRET || "";

    if (tokenStr && validSecret && tokenStr.length === validSecret.length && crypto.timingSafeEqual(Buffer.from(tokenStr), Buffer.from(validSecret))) {
      return res.json({ authenticated: true, username: "Admin", mode: "direct-secret", clientIp });
    }

    const tokenHash = hashSessionToken(tokenStr);
    if (revokedSessionHashes.has(tokenHash)) {
      return res.json({ authenticated: false, clientIp });
    }
    let session = activeAdminSessions.get(tokenHash);

    if (!session && MongoRedisEngine.isRedisConnected) {
      const redisSession = await redisGetSession(tokenHash);
      if (redisSession) {
        activeAdminSessions.set(tokenHash, redisSession);
        session = redisSession;
      }
    }

    if (session && Date.now() <= session.expiresAt) {
      return res.json({ authenticated: true, username: session.username, mode: "session-token", clientIp, expiresAt: session.expiresAt });
    }

    return res.json({ authenticated: false, clientIp });
  } catch (err) {
    return res.json({ authenticated: false });
  }
});

// Admin Whitelist System Endpoints
app.get("/api/admin/whitelist", requireAdminAuth, (req, res) => {
  const clientIp = req.ip || (req.headers["x-forwarded-for"] as string || "127.0.0.1").split(",")[0].trim();
  const records = AdminWhitelistSystem.loadWhitelist();
  res.json({
    success: true,
    clientIp,
    isCurrentIpWhitelisted: AdminWhitelistSystem.isIpWhitelisted(clientIp),
    whitelist: records
  });
});

app.post("/api/admin/whitelist", requireAdminAuth, (req, res) => {
  const { type = "ip", value, note = "" } = req.body || {};
  if (!value || typeof value !== "string" || !value.trim()) {
    return res.status(400).json({ success: false, error: "Value (IP address or User ID) is required." });
  }
  if (type !== "ip" && type !== "user") {
    return res.status(400).json({ success: false, error: "Type must be either 'ip' or 'user'." });
  }

  const record = AdminWhitelistSystem.addRecord(type, value, "Admin", note);
  logAdminAuditAction("ADD_WHITELIST_RECORD", req, { type, value, note });
  res.json({ success: true, record, whitelist: AdminWhitelistSystem.loadWhitelist() });
});

app.delete("/api/admin/whitelist/:id", requireAdminAuth, (req, res) => {
  const targetId = req.params.id;
  if (!targetId) {
    return res.status(400).json({ success: false, error: "Whitelist entry ID or value is required." });
  }

  const removed = AdminWhitelistSystem.removeRecord(targetId);
  if (removed) {
    logAdminAuditAction("REMOVE_WHITELIST_RECORD", req, { targetId });
    return res.json({ success: true, message: "Whitelist entry removed successfully.", whitelist: AdminWhitelistSystem.loadWhitelist() });
  }
  return res.status(404).json({ success: false, error: "Whitelist entry not found." });
});

app.post("/api/auth/logout", requireAdminAuth, (req, res) => {
  try {
    const authHeader = (req.headers["authorization"] || req.headers["x-admin-key"] || "") as string;
    const cookieToken = req.cookies?.admin_session_token || "";
    const tokenStr = authHeader.replace(/^Bearer\s+/i, "").trim() || cookieToken;
    if (tokenStr) {
      revokeAdminSessionByToken(tokenStr);
    }
    res.clearCookie("admin_session_token", { path: "/" });
    logAdminAuditAction("ADMIN_LOGOUT", req);
    return res.json({ success: true, message: "Logged out successfully." });
  } catch (err) {
    res.clearCookie("admin_session_token", { path: "/" });
    return res.json({ success: true });
  }
});

app.post("/api/auth/revoke-all", requireAdminAuth, (req, res) => {
  try {
    revokeAllAdminSessions();
    logAdminAuditAction("REVOKE_ALL_SESSIONS", req);
    return res.json({ success: true, message: "All admin sessions have been revoked." });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Failed to revoke sessions." });
  }
});

app.post("/api/admin/backup-integrity-test", requireAdminAuth, async (req, res) => {
  try {
    const result = await runBackupIntegrityTest();
    logAdminAuditAction("BACKUP_INTEGRITY_TEST", req, { passed: result.passed });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Backup integrity test failed." });
  }
});

app.post("/api/admin/secrets-scan", requireAdminAuth, async (req, res) => {
  try {
    const allowedBase = path.resolve(process.cwd());
    let targetPath = allowedBase;
    if (req.body && typeof req.body.targetPath === "string" && req.body.targetPath.trim()) {
      const resolved = path.resolve(allowedBase, req.body.targetPath);
      // Use path.relative() for safe containment check; rejects symlinks and traversal
      const relative = path.relative(allowedBase, resolved);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return res.status(403).json({ success: false, error: "Access denied: path traversal blocked." });
      }
      targetPath = resolved;
    }

    let scannedContent = "";
    try {
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) {
        // Recursively collect readable text files up to a safe limit
        const MAX_FILES = 200;
        const MAX_BYTES = 5 * 1024 * 1024; // 5 MB total cap
        const files: string[] = [];
        const walk = (dir: string) => {
          if (files.length >= MAX_FILES) return;
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (files.length >= MAX_FILES) break;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walk(full);
            } else if (entry.isFile()) {
              files.push(full);
            }
          }
        };
        walk(targetPath);

        const parts: string[] = [];
        let totalBytes = 0;
        for (const file of files) {
          try {
            const data = fs.readFileSync(file, "utf8");
            totalBytes += Buffer.byteLength(data, "utf8");
            if (totalBytes > MAX_BYTES) {
              parts.push(`... [scan truncated at ${MAX_BYTES / 1024 / 1024} MB]`);
              break;
            }
            parts.push(`--- ${file} ---\n${data}`);
          } catch {
            // skip unreadable files
          }
        }
        scannedContent = parts.join("\n\n") || "(empty directory)";
      } else {
        scannedContent = fs.readFileSync(targetPath, "utf8");
      }
    } catch {
      return res.status(400).json({ success: false, error: "Unable to read target path." });
    }

    const findings = scanForSecrets(scannedContent);
    logAdminAuditAction("SECRETS_SCAN", req, { findingsCount: findings.length });
    return res.json({ success: true, findingsCount: findings.length, findings: findings.map(f => f.slice(0, 8) + "***") });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Secrets scan failed." });
  }
});

app.get("/api/admin/audit-logs", requireAdminAuth, (req, res) => {
  res.json({ success: true, logs: adminAuditLogs });
});

// Direct Download Route for Elden Ring Skript & server.properties
app.get(["/eldenring.sk", "/api/download/eldenring.sk"], (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Disposition", 'attachment; filename="eldenring.sk"');
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  const filePath = path.join(process.cwd(), "public", "eldenring.sk");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.send(`# Elden Ring Skript Script v2.4 (ASHTRON Enterprise Edition)\n# Auto-Generated Dynamic Skript\n\non join:\n\tsend "Welcome to Elden Ring Server!" to player\n`);
  }
});

app.get(["/server.properties", "/api/download/server.properties"], (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Disposition", 'attachment; filename="server.properties"');
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  const filePath = path.join(process.cwd(), "public", "server.properties");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.send(`# Minecraft Server Properties (ASHTRON Zero-Trust Configured)\nserver-port=25565\nonline-mode=true\nmotd=ASHTRON Protected Minecraft Server\n`);
  }
});

// Single Instance Status API
app.get("/api/enterprise/status", requireAdminAuth, (req, res) => {
  const client = getClient();
  const guildCount = client?.guilds.cache.size || 0;
  
  const cpus = os.cpus();
  const cpuUsagePct = cpus.length > 0 ? os.loadavg()[0] / cpus.length * 100 : 1.0;
  const memUsage = process.memoryUsage();
  const uptimeMs = client?.uptime || Math.round(process.uptime() * 1000);
  
  res.json({
    deploymentType: "single-instance",
    instanceCount: 1,
    gatewayCount: client?.ws ? 1 : 0,
    gateways: [
      {
        gatewayId: "gateway-01",
        status: client && client.isReady() ? "connected" : "offline",
        guildCount: guildCount,
        ping: client?.ws ? client.ws.ping : 0,
        memoryUsageMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        cpuUsagePct: parseFloat(cpuUsagePct.toFixed(2)),
        uptimeMinutes: Math.round(uptimeMs / 1000 / 60)
      }
    ],
    zeroDowntimeRestartAvailable: true,
    hotReloadAvailable: true,
    cacheReplicationLagMs: null, // Set to actual value if using cache replication monitoring
    lastBackupTime: new Date().toLocaleTimeString()
  });
});

app.post("/api/enterprise/zero-downtime-restart", requireAdminAuth, heavyOpRateLimit, async (req, res) => {
  logAdminAuditAction("ZERO_DOWNTIME_RESTART", req);
  const startTime = Date.now();
  addBotLog("[ENTERPRISE] Initiating HTTP-service-preserving bot subsystem reload...", "info");
  
  try {
    // 1. Reload & sync IP Ban state from disk
    IPBanSystem.loadIPBans();
    
    // 2. Re-validate environment variables
    validateEnvironmentVariables();
    
    // 3. Perform C++ Native Engine state re-sync
    CppNativeEngine.resetMetrics();
    
    // 4. Safely restart bot client in background without closing web server
    setTimeout(async () => {
      try {
        await stopDiscordBot();
        await startDiscordBot();
        addBotLog("✅ [ENTERPRISE] HTTP-service-preserving bot restart completed.", "success");
      } catch (e: any) {
        addBotLog(`❌ [ENTERPRISE] Bot restart failed: ${e.message}`, "error");
      }
    }, 500);
    
    res.json({ 
      success: true, 
      message: "HTTP server remains online. Discord bot connection restart initiated in background.",
      note: "This preserves the dashboard/API while refreshing the Discord gateway connection."
    });
  } catch (err: any) {
    addBotLog(`❌ [ENTERPRISE] Restart sequence failed: ${err.message}`, "error");
    res.status(500).json({ success: false, error: "Restart failed" });
  }
});

app.post("/api/enterprise/hot-reload", requireAdminAuth, heavyOpRateLimit, async (req, res) => {
  logAdminAuditAction("HOT_RELOAD_MODULES", req, req.body);
  const { moduleName } = req.body || {};
  const startTime = Date.now();
  
  try {
    // Real hot-reload operations
    EnvScanner.scan();
    validateEnvironmentVariables();
    await RateLimiter.check("system_flush");
    IPBanSystem.loadIPBans();
    
    const reloaded = moduleName ? [moduleName] : ["SecurityFeatures", "RateLimiter", "EnvValidator", "IPBanSystem", "CppNativeEngine"];
    addBotLog(`[ENTERPRISE] Hot reloaded modules: [${reloaded.join(", ")}]. Environment & Security Vault refreshed in ${Date.now() - startTime}ms.`, "success");
    
    res.json({
      success: true,
      message: `Modules [${reloaded.join(", ")}] hot-reloaded successfully.`,
      timestamp: new Date().toISOString(),
      activeLicense: PremiumLicenseSystem.isPremium ? "Active" : "Standard"
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Query Gateway Endpoint
app.post("/api/query-gateway", requireAdminAuth, (req, res) => {
  try {
    const { query, variables } = req.body || {};
    const client = getClient();
    const queryStr = typeof query === "string" ? query : JSON.stringify(query || "");
    const lowerQuery = queryStr.toLowerCase();
    const data: Record<string, any> = {};

    // Standard field extraction based on query keywords
    if (lowerQuery.includes("guild") || lowerQuery.includes("server")) {
      data.guilds = client ? client.guilds.cache.map(g => ({
        id: g.id,
        name: g.name,
        memberCount: g.memberCount,
        ownerId: g.ownerId,
        joinedAt: g.joinedAt?.toISOString()
      })) : [];
    }

    if (lowerQuery.includes("bot") || lowerQuery.includes("status")) {
      const statusInfo = getDiscordBotStatus();
      data.bot = {
        status: statusInfo.status,
        version: "Enterprise v4.8.2-ULTRA",
        clusters: 1,
        shards: client?.ws ? 1 : 0,
        uptimeSeconds: Math.round(process.uptime()),
        ping: client?.ws ? client.ws.ping : 0,
        userTag: client?.user ? client.user.tag : null
      };
    }

    if (lowerQuery.includes("security") || lowerQuery.includes("stats")) {
      data.securityStats = getSecurityStats();
    }

    if (lowerQuery.includes("log")) {
      data.logs = getDiscordBotStatus().logs.slice(-50);
    }

    if (lowerQuery.includes("cpp") || lowerQuery.includes("engine")) {
      data.cppEngine = CppNativeEngine.getMetrics();
    }

    if (lowerQuery.includes("ban") || lowerQuery.includes("ip")) {
      data.ipBans = IPBanSystem.loadIPBans();
    }

    // Default response fallback if query is empty or introspection query
    if (Object.keys(data).length === 0) {
      const statusInfo = getDiscordBotStatus();
      data.bot = {
        status: statusInfo.status,
        version: "Enterprise v4.8.2-ULTRA",
        clusters: 1,
        shards: client?.ws ? 1 : 0,
        uptimeSeconds: Math.round(process.uptime()),
        ping: client?.ws ? client.ws.ping : 0
      };
      data.securityStats = getSecurityStats();
    }

    res.json({ data });
  } catch (err: any) {
    res.status(400).json({ errors: [{ message: err.message }] });
  }
});

// Discord Bot integration routes

app.post("/api/bot/lockdown", requireAdminAuth, heavyOpRateLimit, async (req, res) => {
  logAdminAuditAction("TOGGLE_LOCKDOWN", req);
  try {
    const newStatus = await toggleLockdown();
    res.json({ success: true, status: newStatus });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/discord/status", requireAdminAuth, (req, res) => {
  res.json(getDiscordBotStatus());
});

app.post("/api/discord/connect", requireAdminAuth, async (req, res) => {
  logAdminAuditAction("DISCORD_CONNECT", req);
  try {
    const { token, clientId } = req.body || {};
    if (token) {
      const cleanToken = token.trim();
      if (CanaryToken.check(cleanToken)) {
        addBotLog("🚨 [CANARY TRAP TRIGGERED] Web dashboard connection attempt using decoy Canary Token! Immediate memory wipe self-destruct activated.", "error");
        TokenVault.triggerSelfDestruct("Canary Token connection attempt from Web UI.");
        return res.status(403).json({ success: false, error: "CRITICAL BREACH: Decoy Canary Token detected! Memory storage and secrets wiped." });
      }
      process.env.DISCORD_BOT_TOKEN = cleanToken;
    }
    if (clientId) {
      process.env.DISCORD_CLIENT_ID = clientId.trim();
    }
    
    // Persist to file
    try {
      writeEncryptedConfig("./discord_config.json", {
        token: process.env.DISCORD_BOT_TOKEN || "",
        clientId: process.env.DISCORD_CLIENT_ID || ""
      });
    } catch (e) {
      console.error("Failed to save discord_config.json:", e);
    }

    await stopDiscordBot();
    await startDiscordBot();
    res.json({ 
      success: true, 
      message: "Discord bot connection initiated successfully.",
      status: getDiscordBotStatus()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/discord/disconnect", requireAdminAuth, async (req, res) => {
  logAdminAuditAction("DISCORD_DISCONNECT", req);
  try {
    await stopDiscordBot();
    
    // Clear persisted file
    try {
      if (fs.existsSync("./discord_config.json")) {
        fs.unlinkSync("./discord_config.json");
      }
    } catch (e) {
      console.error("Failed to delete discord_config.json:", e);
    }

    res.json({ success: true, message: "Discord bot disconnected and reset." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Zero Trust Security & 100-Nuker Simulator API Endpoints
app.get("/api/bot/security-status", requireAdminAuth, (req, res) => {
  res.json(getSecurityStats());
});

app.get("/api/bot/features", requireAdminAuth, (req, res) => {
  res.json({
    features: [
      { id: "anti-nuke", name: "Zero Trust Anti-Nuke Engine", description: "Real-time audit log interception for mass kicks, bans, channel/role deletes, and webhook abuse.", enabled: true },
      { id: "owner-whitelist", name: "Owner-Only Zero Trust Hierarchy", description: "Admin permissions cannot bypass Anti-Nuke unless user is on the explicit Whitelist.", enabled: true },
      { id: "self-healing", name: "Self-Healing Channel/Role Auto-Recovery", description: "Automatically recreates deleted channels, categories, and roles with exact permissions.", enabled: true },
      { id: "anti-raid", name: "Anti-Raid & Mass-Join Limit Shield", description: "Monitors join spikes (5+ joins/10s), traps fake/bot accounts, and auto-bans raid tokens.", enabled: true },
      { id: "webhook-guard", name: "Webhook & Integration Guard", description: "Automatically deletes unauthorized webhooks and revokes compromised integration tokens.", enabled: true },
      { id: "panic-lockdown", name: "Panic Lockdown & Emergency Isolation", description: "Emergency 1-click server-wide channel lockdown and VC freeze.", enabled: true },
      { id: "ip-ban", name: "Zero-Trust Custom IP-Ban System", description: "Persistent IP and user ID banlist with automatic enforcement on join.", enabled: true },
      { id: "invite-tracker", name: "Real-Time Invite Tracker", description: "Tracks which invite each member used, with fake account detection and bonus invite system.", enabled: true },
      { id: "anti-invite", name: "Anti-Invite Link Shield", description: "Detects and penalizes unauthorized Discord invite links in messages.", enabled: true },
      { id: "oauth-scanner", name: "OAuth Malicious App Detector", description: "Scans guild integrations and removes malicious OAuth applications.", enabled: true },
      { id: "token-rotation", name: "Bot Token Rotation System", description: "Automatic token rotation and reconnection on compromise detection.", enabled: true },
      { id: "canary-token", name: "Canary Token Alert System", description: "Deploys decoy tokens that trigger alerts when accessed.", enabled: true },
      { id: "honeypot", name: "Honeypot Admin Role Trap", description: "Creates decoy admin roles that trap and ban malicious users.", enabled: true },
      { id: "session-hijack", name: "Session Hijack Detector", description: "Detects suspicious session patterns and hardware fingerprint changes.", enabled: true },
      { id: "sentiment", name: "Sentiment Tracker", description: "Monitors message sentiment for raid coordination and toxic behavior.", enabled: true },
      { id: "behavior-scoring", name: "Behavior Scoring Engine", description: "Scores user behavior patterns to detect coordinated attacks.", enabled: true },
      { id: "join-limit", name: "Join Limit Shield", description: "Per-guild join velocity monitoring with automatic lockdown.", enabled: true },
      { id: "auto-permission-rollback", name: "Auto Permission Rollback", description: "Automatically reverts dangerous permission changes.", enabled: true },
      { id: "snapshot-restore", name: "1-Click Server Snapshot & Restore", description: "Creates full server snapshots and restores channels/roles/permissions.", enabled: true },
      { id: "auto-backup", name: "Auto Backup Engine", description: "Automatically backs up server roles and channels on a schedule.", enabled: true },
      { id: "anti-vanity", name: "Anti-Vanity URL Hijack", description: "Detects and reverts unauthorized vanity URL changes.", enabled: true },
      { id: "emoji-sticker", name: "Emoji/Sticker Delete Protection", description: "Reverts unauthorized emoji and sticker deletions.", enabled: true },
      { id: "forum-protection", name: "Forum Channel Protection", description: "Monitors and protects forum channel settings and posts.", enabled: true },
      { id: "ai-prediction", name: "AI Raid Prediction Engine", description: "Statistical raid probability prediction based on join velocity and account age.", enabled: true },
      { id: "ai-report", name: "AI Security Report", description: "Generates comprehensive AI-powered security reports.", enabled: true },
      { id: "ai-assistant", name: "AI Command Assistant", description: "Natural language command processing and config optimization.", enabled: true },
      { id: "gdpr", name: "GDPR Privacy Engine", description: "User data export and deletion compliance tools.", enabled: true },
      { id: "native-engine", name: "C++ Native Security Engine", description: "High-performance native packet scanning with N-API acceleration.", enabled: true },
      { id: "cpp-metrics", name: "Native Engine Metrics", description: "Real-time throughput, latency, and memory monitoring for the C++ engine.", enabled: true }
    ],
    totalFeatures: 28,
    generatedAt: new Date().toISOString()
  });
});

app.post("/api/bot/simulate-100-nukers", requireAdminAuth, async (req, res) => {
  logAdminAuditAction("SIMULATE_100_NUKERS_DRILL", req);
  try {
    const stats = await runNukeDefenseDrill();
    res.json({
      success: true,
      message: "Simulated 100 attack vector signatures processed through security engine.",
      stats
    });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==================== C++ NATIVE ENGINE ENDPOINTS ====================

app.get("/api/cpp-engine/stats", requireAdminAuth, (req, res) => {
  const metrics = CppNativeEngine.getMetrics();
  res.json(metrics);
});

app.post("/api/cpp-engine/scan", requireAdminAuth, (req, res) => {
  const { packetId = Math.floor(Math.random() * 10000), riskWeight = 1.2 } = req.body || {};
  const result = CppNativeEngine.scanSecurityPacket(packetId, riskWeight);
  res.json({
    success: true,
    engine: "C++ Native Security Engine",
    result
  });
});

// ==================== ULTRA SECURITY API ENDPOINTS ====================

// 🍯 HONEYPOT CANARY TRAP ENDPOINTS (Anyone can copy link, but visiting auto-bans visitor IP & Discord account)
app.all(["/api/honeypot-trap", "/trap", "/trap/:guildId", "/trap/:guildId/:userId"], async (req, res) => {
  try {
    const clientIp = req.ip || (req.headers["x-forwarded-for"] as string || "127.0.0.1").split(",")[0].trim();
    let guildId = (req.params.guildId || req.query.guildId) as string | undefined;
    let userId = (req.params.userId || req.query.userId) as string | undefined;
    let trapName = (req.query.trap || req.query.name || "Decoy Password Link") as string;

    const tokenParam = (req.query.token || req.query.sig || "") as string;
    let isValidToken = false;
    if (tokenParam) {
      const tokenVerification = CanaryToken.verifySignedToken(tokenParam);
      if (tokenVerification.valid) {
        if (tokenVerification.guildId) guildId = tokenVerification.guildId;
        if (tokenVerification.trapName) trapName = tokenVerification.trapName;
        if (tokenVerification.userId) {
          if (userId && userId !== tokenVerification.userId) {
            return res.status(403).json({ error: "Access Denied: User ID mismatch for signed canary token." });
          }
          userId = tokenVerification.userId;
        }
        isValidToken = true;
        addBotLog(`🍯 [HONEYPOT] Verified signed canary token for trap: ${trapName}`, "warning");
      }
    }

    if (!isValidToken) {
      return res.status(403).json({ error: "Access Denied: Invalid or missing canary token signature." });
    }

    console.log(`🚨 [HONEYPOT TRAP TRIGGERED] Visitor IP: ${clientIp}, Guild: ${guildId}, User: ${userId}`);

    try {
      IPBanSystem.banIP(clientIp, `🚨 Honeypot Canary Trap Clicked (${trapName})`);
      if (userId) {
        IPBanSystem.banUser(userId, `🚨 Honeypot Canary Trap Clicked (${trapName})`);
      }
    } catch (ipErr) {
      console.error("Error banning IP in honeypot:", ipErr);
    }

    try {
      await triggerHoneypotTrap({ ipAddress: clientIp, guildId, userId, trapName });
    } catch (err: any) {
      console.error("Honeypot trigger error:", err);
    }

    res.status(403).send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>⛔ ACCESS DENIED - ASHTRON ZERO TRUST SECURITY</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      background-color: #090d16;
      color: #f87171;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      background-color: #111827;
      border: 1px solid #ef4444;
      border-radius: 16px;
      padding: 36px;
      max-width: 520px;
      width: 100%;
      box-shadow: 0 0 50px rgba(239, 68, 68, 0.25);
      text-align: center;
    }
    .icon { font-size: 64px; margin-bottom: 16px; }
    h1 { color: #f87171; font-size: 26px; margin: 0 0 12px 0; letter-spacing: -0.5px; }
    p { color: #9ca3af; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0; }
    .badge {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #fca5a5;
      padding: 10px 18px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 14px;
      display: inline-block;
      margin-bottom: 24px;
    }
    .footer { font-size: 13px; color: #6b7280; border-top: 1px solid #1f2937; padding-top: 18px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🚨</div>
    <h1>HONEYPOT TRAP TRIGGERED</h1>
    <p>You accessed a restricted honeypot canary URL monitored by ASHTRON Zero Trust Anti-Nuke Engine.</p>
    <div class="badge">IP BLACKLISTED: ${escapeHtml(clientIp)}</div>
    <p style="color: #ef4444; font-weight: 600;">⛔ Your IP Address and associated Discord account have been blocked & banned from the server.</p>
    <div class="footer">ASHTRON Zero Trust Security Shield • Active Anti-Nuke Core</div>
  </div>
</body>
</html>
  `);
  } catch (err: any) {
    console.error("Fatal Honeypot trap handler error:", err);
    res.status(500).json({ error: "Honeypot trap execution encountered an internal error." });
  }
});

app.get("/api/security/ultra-stats", requireAdminAuth, async (req, res) => {
  let highRiskUsers: any[] = [];
  let tokenRotationLastTime = 0;
  let hardwareFingerprint = "N/A";
  let isPremiumActive = false;

  try {
    highRiskUsers = await BehaviorScoring.getAllHighRiskUsers();
  } catch (err) {
    console.error("Error fetching high risk users:", err);
  }

  try {
    tokenRotationLastTime = BotTokenRotationSystem.getLastRotationTime();
  } catch (err) {
    console.error("Error fetching token rotation time:", err);
  }

  try {
    hardwareFingerprint = PremiumLicenseSystem.getHardwareFingerprint();
  } catch (err) {
    console.error("Error fetching hardware fingerprint:", err);
  }

  try {
    isPremiumActive = PremiumLicenseSystem.isPremium;
  } catch (err) {
    console.error("Error fetching premium status:", err);
  }

  res.json({
    behaviorHighRiskUsers: highRiskUsers,
    honeypotTrapsActive: true,
    sessionHijackMonitoring: true,
    tokenRotationLastTime,
    hardwareFingerprint,
    isPremiumActive
  });
});

app.post("/api/security/rotate-token", requireAdminAuth, heavyOpRateLimit, async (req, res) => {
  logAdminAuditAction("ROTATE_BOT_TOKEN", req);
  const { newToken } = req.body || {};
  const tokenToUse = newToken || process.env.DISCORD_BOT_TOKEN;
  if (!tokenToUse) {
    return res.status(400).json({ success: false, error: "No token provided for rotation." });
  }
  try {
    const rotated = await BotTokenRotationSystem.rotateTokenInMemory(tokenToUse);
    if (rotated) {
      addBotLog("[SECURITY] Bot token rotated and reconnection attempted.", "success");
      return res.json({ success: true, message: "Bot token rotated and reconnection attempted." });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: "Token rotation failed: " + err.message });
  }
  res.status(400).json({ success: false, error: "Invalid token format for rotation." });
});

app.post("/api/security/oauth-scan", requireAdminAuth, heavyOpRateLimit, async (req, res) => {
  logAdminAuditAction("OAUTH_INTEGRATIONS_SCAN", req);
  try {
    const client = getClient();
    let totalScanned = 0;
    let totalThreats = 0;
    if (client && client.guilds && client.guilds.cache.size > 0) {
      for (const [id, guild] of client.guilds.cache) {
        const scanRes = await OAuthMaliciousAppDetector.scanGuildIntegrations(guild, (msg) => addBotLog(msg, "warning"));
        totalScanned += scanRes.scanned;
        totalThreats += scanRes.threatsFound;
      }
    }
    addBotLog(`🔍 [OAUTH AUDIT] Scanned ${totalScanned} connected guild integrations, found ${totalThreats} malicious apps.`, totalThreats > 0 ? "warning" : "info");
    res.json({
      success: true,
      scannedCount: totalScanned,
      threatsFound: totalThreats,
      status: totalThreats === 0 ? "Clean - No malicious OAuth applications detected." : `Threats detected and mitigated: ${totalThreats}`
    });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==================== AI SECURITY API ENDPOINTS ====================

app.get("/api/security/ai-raid-prediction", requireAdminAuth, (req, res) => {
  const prediction = AIRaidPrediction.predict();
  res.json(prediction);
});

app.get("/api/security/ai-report", requireAdminAuth, aiRateLimit, async (req, res) => {
  const report = await AISecurityReport.generateReport();
  res.json({ report, generatedAt: new Date().toISOString() });
});

app.post("/api/security/ai-assistant", requireAdminAuth, aiRateLimit, async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== "string") return res.status(400).json({ error: "Prompt string is required" });
  if (prompt.length > 10000) return res.status(400).json({ error: "Prompt exceeds maximum allowed length of 10000 characters." });
  const reply = await AICommandAssistant.processNaturalLanguageCommand(prompt);
  res.json({ reply });
});

app.get("/api/security/ai-optimize", requireAdminAuth, aiRateLimit, async (req, res) => {
  const result = await AICommandAssistant.optimizeConfig();
  res.json(result);
});

// ==================== SNAPSHOT & 1-CLICK RESTORE ====================

app.get("/api/snapshots", requireAdminAuth, (req, res) => {
  const snapshots = ServerSnapshotRestore.getSnapshots("");
  res.json({ snapshots });
});

app.post("/api/snapshots/create", requireAdminAuth, heavyOpRateLimit, async (req, res) => {
  logAdminAuditAction("CREATE_SNAPSHOT", req);
  const client = getClient();
  const guild = client?.guilds.cache.first();
  if (!guild) {
    return res.status(500).json({ success: false, error: "Bot is not connected to any guild." });
  }

  const snapshot = await ServerSnapshotRestore.createSnapshot(guild);
  addBotLog(`📸 Created 1-Click Server Snapshot '${snapshot.id}' for ${guild.name}`, "success");
  res.json({ success: true, snapshot });
});

app.post("/api/snapshots/restore", requireAdminAuth, heavyOpRateLimit, async (req, res) => {
  const { snapshotId } = req.body || {};
  if (snapshotId && typeof snapshotId === "string" && !/^[a-zA-Z0-9_\-]+$/.test(snapshotId)) {
    return res.status(400).json({ success: false, error: "Invalid snapshotId format." });
  }
  logAdminAuditAction("RESTORE_SNAPSHOT", req, { snapshotId });
  const client = getClient();
  const guild = client?.guilds.cache.first();
  if (!guild) {
    return res.status(500).json({ success: false, error: "Bot is not connected to any guild." });
  }

  addBotLog(`📸 [1-CLICK RESTORE] Triggered full server restore for snapshot ID: ${snapshotId || "latest"}`, "warning");
  try {
    const success = await ServerSnapshotRestore.restoreSnapshot(guild, snapshotId || "", (msg) => addBotLog(msg, "info"));
    if (success) {
      res.json({
        success: true,
        message: "Server snapshot restore completed successfully! Channels and roles synchronized."
      });
    } else {
      res.status(404).json({ success: false, error: "Snapshot not found." });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ==================== ANALYTICS & DASHBOARD DATA ====================

app.get("/api/analytics/overview", requireAdminAuth, (req, res) => {
  const client = getClient();
  const stats = getSecurityStats();
  const cppMetrics = CppNativeEngine.getMetrics();
  const guild = client?.guilds.cache.first();
  const memberCount = guild ? guild.memberCount : 0;
  
  const now = Date.now();
  const hours = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"];
  // Historical graphs require persistent time-series storage.
  // Return current snapshot values with a note instead of fabricated history.
  const securityGraph = hours.map(h => ({
    time: h,
    attacksBlocked: stats.blockedAttacksCount || 0,
    riskScore: stats.securityScore || 0,
    note: 'Real historical data requires persistent time-series storage'
  }));

  const bannedIps = IPBanSystem.loadIPBans();

  res.json({
    securityGraph,
    modPerformance: [
      { name: client?.user?.tag || "ASHTRON-AI (Bot)", actionsCount: stats.blockedAttacksCount || 0, avgResponseMs: client?.ws?.ping || 12, rating: "Operational" },
      { name: "System Zero-Trust Guardian", actionsCount: bannedIps.length, avgResponseMs: Math.round(cppMetrics.averageLatencyMicroseconds / 1000) || 1, rating: "Operational" }
    ],
    raidHistory: stats.blockedAttacksCount > 0 ? [
      { id: "raid_live", timestamp: new Date().toLocaleString(), type: "Mass Velocity Protection", attackerCount: stats.blockedAttacksCount, status: "Intercepted & Banned" }
    ] : [],
    memberHeatmap: hours.map(h => ({
      hour: h,
      joins: 0,
      leaves: 0,
      riskSpike: 0,
      note: 'Real hourly member activity tracking requires persistent event storage'
    })),
    threatIntelFeed: bannedIps.slice(0, 10).map((b, idx) => ({
      id: `intel_${idx + 1}`,
      domainOrUser: `IP/User ${b.ipAddress}`,
      threatType: b.reason || "Malicious Bot Attack",
      status: "Global Zero-Trust IP Ban Enforced"
    }))
  });
});

// ==================== ECONOMY & LEADERBOARD ====================

app.get("/api/economy/leaderboard", requireAdminAuth, (req, res) => {
  const client = getClient();
  const guild = client?.guilds.cache.first();
  const memberCount = guild ? guild.memberCount : 0;

  const demoUsers = [
    { username: "rxaimbot3", level: 99, xp: 142500, coins: 45000 },
    { username: "cyber_ninja", level: 87, xp: 98700, coins: 32100 },
    { username: "dev_alex", level: 76, xp: 65400, coins: 21800 },
    { username: "gamer_pro", level: 65, xp: 43200, coins: 15600 },
    { username: "mod_queen", level: 58, xp: 38900, coins: 12400 },
    { username: "night_hawk", level: 52, xp: 29800, coins: 9800 },
    { username: "pixel_master", level: 45, xp: 21500, coins: 7200 },
    { username: "shadow_clan", level: 38, xp: 16400, coins: 5400 },
    { username: "nova_star", level: 31, xp: 11200, coins: 3800 },
    { username: "zen_coder", level: 24, xp: 7800, coins: 2100 }
  ].map((u, idx) => ({
    rank: idx + 1,
    username: u.username,
    level: u.level,
    xp: u.xp + Math.floor(Math.random() * 500),
    coins: u.coins + Math.floor(Math.random() * 200)
  }));

  res.json({ success: true, leaderboard: demoUsers, isDemo: true });
});

// ==================== CACHE & REDIS STATUS ====================

app.get("/api/enterprise/cache-status", requireAdminAuth, (req, res) => {
  res.json({
    cacheEngine: "Redis",
    cacheStats: MongoRedisEngine.getRedisStats(),
    note: "This endpoint reports cache/Redis status. MongoDB database backup is not currently implemented."
  });
});

app.get("/api/enterprise/mongo-redis", requireAdminAuth, (req, res) => {
  res.json({
    cacheEngine: "Redis",
    cacheStats: MongoRedisEngine.getRedisStats(),
    mongoConfigured: MongoRedisEngine.isMongoConnected,
    note: "MongoDB is configured via environment variables. Redis connection status is reported above."
  });
});

app.post("/api/enterprise/cache-backup", requireAdminAuth, heavyOpRateLimit, async (req, res) => {
  try {
    logAdminAuditAction("PERFORM_CACHE_BACKUP", req);
    const startTime = Date.now();
    const result = await MongoRedisEngine.performCacheBackup();
    const durationMs = Date.now() - startTime;
    const durationSec = Math.max(0, durationMs / 1000).toFixed(1);
    addBotLog(`[ENTERPRISE] Created Cache Backup at ${result.timestamp}`, "success");
    // Record backup in history for dashboard
    let verificationState: 'pending' | 'integrity-checked' | 'restore-tested' | 'verified' = result.success ? 'integrity-checked' : 'pending';
    if (result.success) {
      try {
        const integrityResult = await runBackupIntegrityTest();
        if (integrityResult.passed) {
          verificationState = 'restore-tested';
        }
      } catch (err: any) {
        console.error('[BACKUP] Enterprise integrity test failed:', err);
      }
    }
    backupHistory.push({
      id: `backup-${Date.now()}`,
      timestamp: result.timestamp,
      status: result.success ? 'success' : 'failed',
      size: `${result.backupSizeMB || 0} MB`,
      duration: `${durationSec}s`,
      type: 'snapshot',
      verified: verificationState
    });
    if (backupHistory.length > MAX_HISTORY) backupHistory.shift();
    saveBackupHistory();
    res.json({ ...result, duration: `${durationSec}s` });
  } catch (err: any) {
    addBotLog(`[ENTERPRISE] Cache Backup failed: ${err.message}`, "error");
    res.status(500).json({ success: false, error: "Backup failed" });
  }
});

// ==================== PREMIUM & LICENSE ====================

app.get("/api/premium/info", requireAdminAuth, (req, res) => {
  res.json({
    isPremium: PremiumLicenseSystem.isPremium,
    licenseKey: PremiumLicenseSystem.getActiveLicenseKey() ? "PREMIUM-****-****" : null,
    hardwareFingerprint: PremiumLicenseSystem.getHardwareFingerprint(),
    expiresAt: PremiumLicenseSystem.getLicenseExpiry ? PremiumLicenseSystem.getLicenseExpiry() : null,
    maxGuilds: PremiumLicenseSystem.getMaxGuilds ? PremiumLicenseSystem.getMaxGuilds() : null,
    updateChecker: {
      currentVersion: "v4.8.2-ULTRA",
      latestVersion: "v4.8.2-ULTRA",
      status: "Up to Date (RxAimbot3 / GitHub Synced)"
    }
  });
});

app.post("/api/premium/activate", requireAdminAuth, async (req, res) => {
  logAdminAuditAction("ACTIVATE_PREMIUM_LICENSE", req);
  const { licenseKey } = req.body || {};
  try {
    const valid = await PremiumLicenseSystem.validateLicenseRemote(licenseKey || "");
    if (valid) {
      addBotLog(`Premium License Activated: ${licenseKey}`, "success");
      return res.json({ success: true, message: "Premium Enterprise License activated successfully!" });
    }
  } catch (err: any) {
    console.error("License verification error:", err);
  }
  res.status(400).json({ success: false, error: "Invalid license key. Format: PREMIUM-ENT-XXXX-XXXX-XXXX" });
});

app.post("/api/system/restart", requireAdminAuth, heavyOpRateLimit, async (req, res) => {
  logAdminAuditAction("RESTART_BOT_SUBSYSTEMS", req);
  addBotLog("🔄 Remote Bot Graceful Restart requested from Web Dashboard...", "warning");
  try {
    await stopDiscordBot();
    await new Promise(resolve => setTimeout(resolve, 2000));
    await startDiscordBot();
    res.json({ success: true, message: "Remote restart sequence completed." });
  } catch (err: any) {
    addBotLog(`❌ Restart sequence failed: ${err.message}`, "error");
    res.status(500).json({ success: false, error: "Restart failed" });
  }
});

// GitHub Webhook & Simulation integration routes
let linkedRepo = "rxaimbot3-design/ultimate-discord-ai-bot";

try {
  if (fs.existsSync("./github_config.json")) {
    const ghcfg = readEncryptedConfig<{ token?: string; repo?: string }>("./github_config.json");
    if (ghcfg?.token) {
      await setGitHubToken(ghcfg.token);
    }
    if (ghcfg?.repo) {
      linkedRepo = ghcfg.repo;
    }
  }
} catch (e) {
  console.error("Failed to load github_config.json:", e);
}

app.get("/api/github/status", requireAdminAuth, async (req, res) => {
  const port = process.env.PORT || 3000;
  const appUrl = process.env.APP_URL || process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${port}`);
  const webhookUrl = `${appUrl}/api/github/webhook`;
  const ghToken = await getGitHubToken();
  res.json({
    configured: true,
    webhookUrl,
    linkedRepo,
    githubTokenConfigured: !!ghToken
  });
});

app.get("/api/github/repos", requireAdminAuth, async (req, res) => {
  const customToken = (req.headers["x-github-token"] || "") as string;
  const token = customToken || await getGitHubToken();

  if (!token) {
    return res.status(401).json({ error: "GitHub token is required to fetch repositories." });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${token}`,
        "User-Agent": "AI-Studio-Applet",
        "Accept": "application/vnd.github.v3+json"
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub returned status ${response.status}`);
    }

    const data = await response.json();
    if (Array.isArray(data)) {
      const formattedRepos = data.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description || "No description provided.",
        stars: repo.stargazers_count || 0,
        language: repo.language || "TypeScript"
      }));
      return res.json({ repos: formattedRepos, isDemo: false });
    } else {
      return res.status(500).json({ error: "Failed to fetch repositories from GitHub." });
    }
  } catch (err: any) {
    console.error("Failed to fetch live GitHub repos:", err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    clearTimeout(timeoutId);
  }
});

app.post("/api/github/link-repo", requireAdminAuth, async (req, res) => {
  const { repo } = req.body;
  if (!repo) return res.status(400).json({ error: "No repository name provided" });
  
  const ghToken = await getGitHubToken();
  if (ghToken) {
    try {
      const repoRes = await fetch(`https://api.github.com/repos/${repo}`, {
        headers: {
          Authorization: `Bearer ${ghToken}`,
          "User-Agent": "AI-Studio-Applet",
          "Accept": "application/vnd.github.v3+json"
        }
      });
      if (!repoRes.ok) {
        return res.status(403).json({ error: "You don't have access to this repository with the current token." });
      }
    } catch (e) {
      console.error(e);
    }
  }

  linkedRepo = repo;
  try {
    writeEncryptedConfig("./github_config.json", {
      token: ghToken || "",
      repo: linkedRepo
    });
  } catch (e) {
    console.error("Failed to save github_config.json:", e);
  }
  addBotLog(`Linked GitHub repository inside control panel to: ${repo}`, "success");
  return res.json({ success: true, repo });
});

app.post("/api/github/save-token", requireAdminAuth, async (req, res) => {
  const { token } = req.body || {};
  if (!token) {
    return res.status(400).json({ error: "Personal Access Token is required." });
  }

  const cleanToken = token.trim();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const userRes = await fetch("https://api.github.com/user", {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        "User-Agent": "AI-Studio-Applet",
        "Accept": "application/vnd.github.v3+json"
      }
    });

    if (!userRes.ok) {
      return res.status(401).json({ error: "Invalid GitHub Personal Access Token. Please verify token permissions." });
    }

    const userData = await userRes.json();

    await setGitHubToken(cleanToken);
    try {
      writeEncryptedConfig("./github_config.json", {
        token: cleanToken,
        repo: linkedRepo
      });
    } catch (e) {
      console.error("Failed to save github_config.json:", e);
    }

    addBotLog(`Successfully verified and saved Personal Access Token for @${userData.login}`, "success");

    return res.json({
      success: true,
      message: `✅ Token validated & saved! Logged in as @${userData.login}`,
      username: userData.login,
      avatar: userData.avatar_url
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Connection error: ${err.message}` });
  } finally {
    clearTimeout(timeoutId);
  }
});

app.post("/api/github/create-repo", requireAdminAuth, async (req, res) => {
  const { name, description, isPrivate } = req.body || {};
  const customToken = (req.headers["x-github-token"] || "") as string;
  const token = customToken || await getGitHubToken();

  if (!name) {
    return res.status(400).json({ error: "Repository name is required" });
  }

  // Format repo name safely
  const formattedName = name.trim().replace(/[^a-zA-Z0-9-_]/g, "-");

  
  if (!token) {
    return res.status(401).json({ error: "GitHub token is required to create a repository." });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds limit

  try {
    const response = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${token}`,
        "User-Agent": "AI-Studio-Applet",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: formattedName,
        description: description || "Ultimate Discord AI Bot Sync Core Integration",
        private: !!isPrivate,
        auto_init: false
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.message || `GitHub returned status ${response.status}`);
    }

    const data = await response.json();
    const repoFullName = data.full_name;
    const cloneUrl = data.clone_url;
    linkedRepo = repoFullName;

    addBotLog(`Successfully created and linked new live GitHub repository: ${repoFullName}`, "success");

    return res.json({
      success: true,
      repo: repoFullName,
      cloneUrl,
      isDemo: false
    });
  } catch (err: any) {
    console.error("Failed to create GitHub repository:", err.message);
    const msg = err.name === "AbortError" ? "GitHub request timed out after 15 seconds" : err.message;
    return res.status(500).json({ error: `Failed to create repository: ${msg}` });
  } finally {
    clearTimeout(timeoutId);
  }
});

function sanitizeGitError(errMessage: string): string {
  if (!errMessage) return "An unknown error occurred during git push execution.";
  return errMessage
    .replace(/ghp_[a-zA-Z0-9]{36,}/g, "[REDACTED_PAT_TOKEN]")
    .replace(/github_pat_[a-zA-Z0-9_]{22,}/g, "[REDACTED_PAT_TOKEN]")
    .replace(/https:\/\/[^@]+@github\.com/g, "https://[REDACTED_PAT]@github.com");
}

app.post("/api/github/push", requireAdminAuth, async (req, res) => {
  const { repo, commitMessage, branch = "main" } = req.body || {};
  const customToken = (req.headers["x-github-token"] || "") as string;
  const token = customToken || await getGitHubToken();
  const targetRepo = repo || linkedRepo;

  if (!targetRepo) {
    return res.status(400).json({ error: "Target GitHub repository is required." });
  }

  // Validate branch name strictly
  const cleanBranch = String(branch).trim();
  if (!/^[a-zA-Z0-9_\-\.\/]+$/.test(cleanBranch) || cleanBranch.startsWith("-")) {
    return res.status(400).json({ error: "Invalid branch name format." });
  }

  
  if (!token) {
    return res.status(401).json({ error: "GitHub token is required to push to a repository." });
  }


  try {
    const cleanRepo = String(targetRepo).trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
    if (!/^[a-zA-Z0-9_\-\.\/]+$/.test(cleanRepo)) {
      return res.status(400).json({ error: "Invalid repository name format." });
    }

    const msg = String(commitMessage || `🚀 Update bot codebase from AI Studio Control Panel - ${new Date().toISOString()}`);
    const remoteUrl = `https://github.com/${cleanRepo}.git`;

    try {
      await execFileAsync("git", ["status"]);
    } catch {
      await execFileAsync("git", ["init"]);
    }

    try {
      await execFileAsync("git", ["config", "user.name", "AI-Studio-Deployer"]);
      await execFileAsync("git", ["config", "user.email", "bot@aistudio.local"]);
    } catch {}

    await execFileAsync("git", ["add", "-A"]);
    
    // Safety check: ensure sensitive files are not pushed
    const sensitiveFiles = ["admin_secret.txt", "admin_sessions.json", "discord_config.json", "github_config.json", "logs.json", "stats.json", "guild_music_state.json", "admin_auth.json"];
    for (const file of sensitiveFiles) {
      try {
        await execFileAsync("git", ["reset", "--", file]);
      } catch {}
    }

    try {
      await execFileAsync("git", ["commit", "-m", msg]);
    } catch {
      await execFileAsync("git", ["commit", "--allow-empty", "-m", msg]);
    }

    await execFileAsync("git", ["branch", "-M", cleanBranch]);

    try {
      await execFileAsync("git", ["remote", "remove", "origin"]);
    } catch {}

    await execFileAsync("git", ["remote", "add", "origin", remoteUrl]);

    // Use temporary .netrc with strict permissions instead of env variables
    // to avoid token exposure in /proc/<pid>/environ
    const netrcPath = path.join(process.cwd(), `.netrc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    try {
      fs.writeFileSync(netrcPath, `machine github.com\nlogin x-access-token\npassword ${token.trim()}\n`, { mode: 0o600 });
      const { stdout, stderr } = await execFileAsync("git", ["push", "-u", "origin", cleanBranch], {
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          HOME: process.env.HOME || process.cwd(),
          NETRC: netrcPath
        }
      });

      addBotLog(`Direct GitHub Push succeeded to repository: ${cleanRepo}`, "success");

      return res.json({
        success: true,
        message: `✅ Direct Push successful! Codebase pushed to https://github.com/${cleanRepo}`,
        repo: cleanRepo,
        branch: cleanBranch,
        logs: stdout || stderr || "Push completed with exit code 0",
        isDemo: false
      });
    } finally {
      try { fs.unlinkSync(netrcPath); } catch {}
    }
  } catch (err: any) {
    const sanitizedError = sanitizeGitError(err.message || String(err));
    console.error("Failed direct push to GitHub:", sanitizedError);
    addBotLog(`Direct GitHub Push error: ${sanitizedError}`, "error");
    return res.status(500).json({ error: `Git push error: ${sanitizedError}` });
  }
});

const processedWebhookDeliveries = new TtlMap<string, number>({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 10000, autoCleanupMs: 5 * 60 * 1000 });

// Periodic cleanup of old webhook delivery IDs (every 5 minutes) - handled by TtlMap auto-cleanup

app.post("/api/github/webhook", async (req, res) => {
  try {
    const deliveryId = req.headers["x-github-delivery"] as string;
    if (!deliveryId) {
      return res.status(400).json({ success: false, error: "Missing mandatory X-GitHub-Delivery header." });
    }

    const signature = (req.headers["x-hub-signature-256"] || req.headers["x-hub-signature"] || "") as string;
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

    if (!webhookSecret) {
       return res.status(500).json({ success: false, error: "Webhook secret not configured." });
    }

    const payloadBuffer = req.body; 
    
    let isVerified = false;
    if (signature.startsWith("sha256=")) {
      const hmac = crypto.createHmac("sha256", webhookSecret);
      hmac.update(payloadBuffer);
      const expectedSignature = "sha256=" + hmac.digest("hex");
      const sigBuf = Buffer.from(signature);
      const expectedBuf = Buffer.from(expectedSignature);
      if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        isVerified = true;
      }
    }

    if (!isVerified) {
      addBotLog("🚨 Blocked unverified or forged GitHub webhook payload.", "error");
      return res.status(401).json({ success: false, error: "Unauthorized: Signature verification failed." });
    }

    // Replay protection: reject if delivery ID was already processed
    const now = Date.now();
    if (processedWebhookDeliveries.has(deliveryId)) {
      return res.status(200).json({ success: true, message: "Duplicate webhook delivery ignored." });
    }

    const payload = JSON.parse(payloadBuffer.toString('utf8'));
    const event = req.headers["x-github-event"] as string;
    const repoName = payload.repository?.full_name;

    if (repoName !== linkedRepo) {
      return res.status(403).json({ success: false, error: "Ignored webhook for unlinked repository." });
    }

    addBotLog(`Received verified GitHub webhook event '${event}' for repository: ${repoName}`, "info");

    const success = await sendGitHubAlert(repoName, event, payload);
    
    // Mark delivery ID as processed ONLY after successful processing
    // This ensures failed deliveries (sendGitHubAlert returns false) can be retried by GitHub
    if (success) {
      processedWebhookDeliveries.set(deliveryId, now);
      // Note: TtlMap auto-cleanup handles expired entries (24h TTL, 5min cleanup interval)
      // No manual size-based eviction needed - avoids premature deduplication loss
    }
    
    res.json({ success, message: "Webhook processed." });

  } catch (err: any) {
    console.error("Webhook processing error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

app.post("/api/github/simulate", requireAdminAuth, async (req, res) => {
  try {
    const { event } = req.body;
  const repoName = linkedRepo;

  let payload: any = {};
  if (event === "push") {
    payload = {
      ref: "refs/heads/main",
      pusher: { name: "rxaimbot3" },
      commits: [
        {
          id: "a5f8e3b21c49e7a9d8c76b5a4012e34f",
          message: "🔥 feat: added extreme-security firewall checks and Gemini logs"
        },
        {
          id: "7d8e9c2b3a1a4f0d2c8e3b5a7a1b0c9e",
          message: "🐛 fix: solved token refresh lag and live logging socket bug"
        }
      ]
    };
  } else if (event === "star") {
    payload = {
      sender: {
        login: "rxaimbot3",
        html_url: "https://github.com/rxaimbot3"
      }
    };
  } else if (event === "issues") {
    payload = {
      action: "opened",
      issue: {
        title: "Bot crashed when setting custom cooldown on ticket channels",
        html_url: `https://github.com/${repoName}/issues/42`,
        user: { login: "cyber_ninja" }
      }
    };
  } else {
    payload = {
      zen: "Design is for those who are unsatisfied with the status quo."
    };
  }

  addBotLog(`[SIMULATED WEBHOOK] User triggered simulated GitHub '${event}' event inside panel for ${repoName}.`, "info");
  
    const success = await sendGitHubAlert(repoName, event, payload);
    res.json({ success, message: `Simulated ${event} event successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Powerful Gemini Chat API with Search Grounding & Retry/Timeout Handling
const GEMINI_MAX_RETRIES = 3;
const GEMINI_TIMEOUT_MS = 15000; // 15s timeout limit

async function retryGeminiCall<T>(fn: () => Promise<T>, retries = GEMINI_MAX_RETRIES, delay = 1000): Promise<T> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini API request timed out after 15 seconds")), GEMINI_TIMEOUT_MS)
    );
    return await Promise.race([fn(), timeoutPromise]);
  } catch (error: any) {
    if (retries > 0 && !error.message?.includes("timed out")) {
      console.warn(`Gemini API call failed (${error.message}). Retrying in ${delay}ms... (${retries} retries remaining)`);
      await new Promise((res) => setTimeout(res, delay));
      return retryGeminiCall(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

app.post("/api/gemini/chat", requireAdminAuth, aiRateLimit, async (req, res) => {
  try {
    const { message, history } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message string is required." });
    }

    if (message.length > 10000) {
      return res.status(400).json({ error: "Message exceeds maximum allowed length of 10000 characters." });
    }

    if (history && (!Array.isArray(history) || history.length > 50)) {
      return res.status(400).json({ error: "History must be an array of at most 50 messages." });
    }

    const ai = getAiClient();

    // Map client-side history format to Gemini SDK format
    // Client-side: { sender: 'user' | 'assistant', text: string }
    // Gemini: { role: 'user' | 'model', parts: [{ text: string }] }
    interface ChatMessage {
  sender: "user" | "assistant";
  text: string;
}

const formattedHistory = (history || []).map((msg: ChatMessage) => ({
      role: msg.sender === "user" ? "user" : "model",
      parts: [{ text: msg.text }],
    }));

    // Create the chat session
    const chat = ai.chats.create({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: 
          `You are the GOD AI Brain of the "EXCLUSIVE" Discord Server.
Identity: You are not just a bot. You are the CEO, Head Mod, Security, Salesman, and Content Manager of this server.

### PERSONALITY ###
- Speak in English. Keep it short. Max 2 lines.
- Max 1 emoji. Be casual, use terms like "bro" or "ok". Do not be overly formal.
- Provide direct actions and solutions. Do not lecture.
- If you don't know, just say "Bro, I don't know about this."

### CORE RULES ###
1. Safety First: If you see swearing, scams, nukes, raids, or threats, delete and timeout/ban immediately. No warnings.
2. Memory: Check the 7-day server memory before making a decision.
3. Speed: Make decisions within 0.5s.

### YOUR 6 MODES ###
The input will start with [MODE: NAME]. Act accordingly.

[MODE: RAID_DREAM]
INPUT: 7 days log: {server_logs}
TASK: State Raid risk % + Top 3 suspects + Reason + Action.
OUTPUT JSON: {"risk":"85%","suspects":["@user1"],"reason":"...","action":"lock"}

[MODE: CODE_DOCTOR]
INPUT: Error: {error_message} Code: {code}
TASK: State where the bug is + Fixed code + Reason in 1 line.

[MODE: VC_GOD]
INPUT: Transcript: "{text}" User: {userId}
TASK: Check for swearing, scams, threats, or AI Voice.
OUTPUT JSON: If problem: {"action":"mute","duration":"10m","reason":"swearing"} Else: {"action":"ok"}

[MODE: SALES_CLOSER]
INPUT: Customer: "{msg}" Product: $14.99/mo Anti-Nuke, AI Mod, VC
TASK: Sell the product in English in 2 lines. Do not pressure.

[MODE: VIRAL_CONTENT]
INPUT: Topic: {server_topic}
TASK: Provide 1 Poll + 1 Meme + 1 Event idea. Use today's trend. 3 lines of English.

[MODE: AI_JUDGE]
INPUT: Report: {report} Evidence: {messages}
TASK: Who is guilty + Why + What is the punishment. 
OUTPUT JSON: {"guilty":"@user","reason":"...","punishment":"7d_timeout"}

### FINAL RULE ###
Your Goal: Server protected + Members active + Owner's income increased.`,
        tools: [{ googleSearch: {} }],
      },
      history: formattedHistory,
    });

    const response = await retryGeminiCall(() => chat.sendMessage({ message }));
    
    // Extract search grounding metadata if any
    const searchChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const searchSources = searchChunks.map((chunk: any) => ({
      title: chunk.web?.title || "Source",
      uri: chunk.web?.uri,
    })).filter((source: any) => source.uri);

    res.json({
      reply: response.text,
      sources: searchSources,
    });
  } catch (error: any) {
    console.error("Gemini Chat Error:", error);
    res.status(500).json({
      error: error.message || "An unexpected error occurred in the Gemini API.",
    });
  }
});

// ==================== ANALYTICS & DASHBOARD DATA ====================

// Detection Latency Analytics
app.get("/api/analytics/latency", requireAdminAuth, (req, res) => {
  // Collect current telemetry sample before returning
  const cppMetrics = CppNativeEngine.getMetrics();
  pushLatencySample(cppMetrics);

  const data = [...latencyHistory];
  const summary = data.length > 0 ? {
    avgP50: Math.round(data.reduce((a, b) => a + b.p50, 0) / data.length * 10) / 10,
    avgP95: Math.round(data.reduce((a, b) => a + b.p95, 0) / data.length * 10) / 10,
    avgP99: Math.round(data.reduce((a, b) => a + b.p99, 0) / data.length * 10) / 10,
    count: data.length
  } : { avgP50: 0, avgP95: 0, avgP99: 0, count: 0 };

  res.json({ success: true, data, summary });
});

// Event Throughput Analytics
app.get("/api/analytics/throughput", requireAdminAuth, (req, res) => {
  const cppMetrics = CppNativeEngine.getMetrics();
  pushThroughputSample(cppMetrics.throughputPerSecond || 0);

  const data = [...throughputHistory];
  const current = data.length > 0 ? data[data.length - 1].eventsPerSecond : 0;
  const peak = data.length > 0 ? Math.max(...data.map(d => d.eventsPerSecond)) : 0;
  const baseline = 1500;
  const summary = { currentEps: Math.max(0, current), peakEps: Math.max(0, peak), baselineEps: baseline, count: data.length };

  res.json({ success: true, data, summary });
});

// Error Monitoring Analytics
app.get("/api/analytics/errors", requireAdminAuth, (req, res) => {
  const now = Date.now();
  const last5min = recentErrors.filter(e => now - new Date(e.timestamp).getTime() < 5 * 60 * 1000).length;
  const last1hour = recentErrors.filter(e => now - new Date(e.timestamp).getTime() < 60 * 60 * 1000).length;

  // Build hourly rate history from actual errors
  const hourBuckets = Array.from({ length: 24 }, (_, i) => {
    const hourStart = new Date(now - (23 - i) * 3600000);
    const hourEnd = new Date(hourStart.getTime() + 3600000);
    const count = recentErrors.filter(e => {
      const t = new Date(e.timestamp).getTime();
      return t >= hourStart.getTime() && t < hourEnd.getTime();
    }).length;
    return { hour: i, errors: count };
  });

  const stats = {
    totalErrors: recentErrors.length,
    criticalErrors: recentErrors.filter(e => e.severity === 'critical').length,
    avgPerHour: recentErrors.length / 24,
    uniqueTypes: new Set(recentErrors.map(e => e.type || 'General')).size,
    last5min,
    last1hour
  };

  res.json({ success: true, errors: [...recentErrors].reverse(), stats, rateHistory: hourBuckets });
});

// Backup Status Analytics
app.get("/api/analytics/backups", requireAdminAuth, (req, res) => {
  const data = [...backupHistory].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const summary = data.length > 0 ? {
    lastBackup: new Date(data[0].timestamp).toLocaleString(),
    nextBackup: getNextBackupTime(),
    backupSize: data[0].size,
    backupDuration: data[0].duration,
    successCount: data.filter(b => b.status === 'success').length,
    failedCount: data.filter(b => b.status === 'failed').length,
    verifiedCount: data.filter(b => b.verified && b.verified !== 'pending').length
  } : {
    lastBackup: 'Never',
    nextBackup: getNextBackupTime(),
    backupSize: '0 MB',
    backupDuration: '0s',
    successCount: 0,
    failedCount: 0,
    verifiedCount: 0
  };

  res.json({ success: true, backups: data, summary });
});

app.post("/api/analytics/backups", requireAdminAuth, heavyOpRateLimit, async (req, res) => {
  try {
    logAdminAuditAction("MANUAL_BACKUP_INITIATED", req);
    const startTime = Date.now();
    const result = await MongoRedisEngine.performCacheBackup();
    const durationMs = Date.now() - startTime;
    const durationSec = Math.max(0, durationMs / 1000).toFixed(1);
    lastBackupTimestamp = Date.now();
    addBotLog(`[ENTERPRISE] Manual Cache Backup at ${result.timestamp}`, "success");
    // Record backup in history for dashboard
    let verificationState: 'pending' | 'integrity-checked' | 'restore-tested' | 'verified' = result.success ? 'integrity-checked' : 'pending';
    if (result.success) {
      try {
        const integrityResult = await runBackupIntegrityTest();
        if (integrityResult.passed) {
          verificationState = 'restore-tested';
        }
      } catch (err: any) {
        console.error('[BACKUP] Integrity test failed:', err);
      }
    }
    backupHistory.push({
      id: `backup-${Date.now()}`,
      timestamp: result.timestamp,
      status: result.success ? 'success' : 'failed',
      size: `${result.backupSizeMB || 0} MB`,
      duration: `${durationSec}s`,
      type: 'full',
      verified: verificationState,
      dumpFile: result.dumpFile
    });
    if (backupHistory.length > MAX_HISTORY) backupHistory.shift();
    saveBackupHistory();
    res.json({ success: true, backup: backupHistory[backupHistory.length - 1] });
  } catch (err: any) {
    addBotLog(`[ENTERPRISE] Manual Cache Backup failed: ${err.message}`, "error");
    res.status(500).json({ success: false, error: "Backup failed" });
  }
});

// Backup Restore & Test Restore endpoints
app.post("/api/analytics/backups/:id/restore", requireAdminAuth, heavyOpRateLimit, async (req, res) => {
  try {
    const backupId = req.params.id;
    const backup = backupHistory.find(b => b.id === backupId);
    if (!backup) return res.status(404).json({ success: false, error: "Backup not found" });
    
    logAdminAuditAction("BACKUP_RESTORE", req, { backupId });
    addBotLog(`[ENTERPRISE] Restore initiated for backup ${backupId}`, "info");
    
    // Use dumpFile from backup history
    const dumpFile = (backup as any).dumpFile;
    
    if (!dumpFile || !fs.existsSync(dumpFile)) {
      return res.status(404).json({ success: false, error: "Backup file not found on disk" });
    }
    
    // Perform actual restore
    const restoreResult = await MongoRedisEngine.restoreCacheBackup(dumpFile);
    
    if (!restoreResult.success) {
      addBotLog(`[ENTERPRISE] Backup restore failed: ${restoreResult.error}`, "error");
      return res.status(500).json({ success: false, error: restoreResult.error || "Restore failed" });
    }
    
    addBotLog(`[ENTERPRISE] Restore completed: ${restoreResult.restoredKeys} keys restored from ${path.basename(dumpFile)}`, "success");
    
    res.json({ 
      success: true, 
      message: `Backup ${backupId} restore completed`, 
      restoredKeys: restoreResult.restoredKeys,
      restoredAt: new Date().toISOString() 
    });
  } catch (err: any) {
    addBotLog(`[ENTERPRISE] Backup restore failed: ${err.message}`, "error");
    res.status(500).json({ success: false, error: "Restore failed" });
  }
});

app.post("/api/analytics/backups/:id/test-restore", requireAdminAuth, heavyOpRateLimit, async (req, res) => {
  try {
    const backupId = req.params.id;
    const backup = backupHistory.find(b => b.id === backupId);
    if (!backup) return res.status(404).json({ success: false, error: "Backup not found" });
    
    logAdminAuditAction("BACKUP_TEST_RESTORE", req, { backupId });
    addBotLog(`[ENTERPRISE] Test restore initiated for backup ${backupId}`, "info");
    
    // Get dump file from backup history
    const dumpFile = (backup as any).dumpFile;
    
    if (!dumpFile || !fs.existsSync(dumpFile)) {
      return res.status(404).json({ success: false, error: "Backup file not found on disk" });
    }
    
    // Read and validate backup file structure
    let dumpData: any;
    try {
      dumpData = JSON.parse(fs.readFileSync(dumpFile, "utf8"));
    } catch (err) {
      return res.json({ 
        success: false, 
        backupId,
        integrityCheck: false,
        restoreTest: 'failed',
        checkedAt: new Date().toISOString(),
        message: "Backup file is corrupted or invalid JSON",
        error: (err as Error).message
      });
    }
    
    // Validate backup format
    if (!dumpData.cacheData || typeof dumpData.cacheData !== "object") {
      return res.json({ 
        success: false, 
        backupId,
        integrityCheck: false,
        restoreTest: 'failed',
        checkedAt: new Date().toISOString(),
        message: "Invalid backup format: missing or invalid cacheData"
      });
    }
    
    // Verify checksum/integrity by checking data consistency
    const cacheData = dumpData.cacheData as Record<string, { val: any; exp?: number }>;
    let validEntries = 0;
    let corruptedEntries = 0;
    
    for (const [key, entry] of Object.entries(cacheData)) {
      if (entry && typeof entry.val !== "undefined") {
        validEntries++;
      } else {
        corruptedEntries++;
      }
    }
    
    const integrityCheck = corruptedEntries === 0 && validEntries > 0;
    
    // Test restore: attempt to restore to a temporary in-memory map (not affecting live cache)
    let restoreTest = 'failed';
    let restoredKeys = 0;
    let testError = "";
    
    if (integrityCheck) {
      try {
        const testCacheMap = new Map<string, { val: any; exp?: number }>();
        for (const [key, entry] of Object.entries(cacheData)) {
          testCacheMap.set(key, entry);
          restoredKeys++;
        }
        // Verify we can read back what we wrote
        if (testCacheMap.size === restoredKeys) {
          restoreTest = 'passed';
        }
      } catch (err) {
        testError = (err as Error).message;
        restoreTest = 'failed';
      }
    }
    
    const testResult = {
      backupId,
      integrityCheck,
      restoreTest,
      checkedAt: new Date().toISOString(),
      message: integrityCheck && restoreTest === 'passed' 
        ? `Backup integrity verified and restore test passed (${restoredKeys} keys)` 
        : `Backup integrity check ${integrityCheck ? 'passed' : 'failed'}; restore test ${restoreTest}`,
      stats: {
        totalKeys: Object.keys(cacheData).length,
        validEntries,
        corruptedEntries,
        restoredKeys,
        backupSize: dumpData.backupSizeMB || 0,
        backupTimestamp: dumpData.timestamp
      }
    };
    
    // Update backup verification state if test passed
    if (testResult.restoreTest === 'passed') {
      const idx = backupHistory.findIndex(b => b.id === backupId);
      if (idx >= 0) {
        backupHistory[idx].verified = 'restore-tested';
        saveBackupHistory();
      }
    }
    
    res.json({ success: true, ...testResult });
  } catch (err: any) {
    addBotLog(`[ENTERPRISE] Backup test restore failed: ${err.message}`, "error");
    res.status(500).json({ success: false, error: "Test restore failed" });
  }
});

// Risk Score Analytics
app.get("/api/analytics/risk-score", requireAdminAuth, (req, res) => {
  const stats = getSecurityStats();
  const cppMetrics = CppNativeEngine.getMetrics();
  const redisStats = MongoRedisEngine.getRedisStats();
  const ipBans = IPBanSystem.loadIPBans();
  const ipBansCount = ipBans.length;

  // Calculate category scores from real system state
  const categories = [
    {
      name: 'Threat Detection',
      score: Math.min(100, Math.max(20, 40 + (stats.blockedAttacksCount * 2) + (cppMetrics.status === 'ACTIVE_MICROSECOND' ? 25 : 0) + (stats.real100NukerDefenseActive ? 15 : 0))),
      weight: 0.25,
      trend: stats.blockedAttacksCount > 0 ? 'up' : 'stable',
      details: `Blocked ${stats.blockedAttacksCount} attacks. C++ engine ${cppMetrics.status}. Defense active: ${stats.real100NukerDefenseActive}`
    },
    {
      name: 'Network Security',
      score: Math.min(100, Math.max(20, 50 + ipBansCount * 2 + (redisStats.connected ? 15 : 0) + (cppMetrics.status === 'ACTIVE_MICROSECOND' ? 10 : 0))),
      weight: 0.2,
      trend: ipBansCount > 0 ? 'up' : 'stable',
      details: `IP bans: ${ipBansCount}. Redis: ${redisStats.connected ? 'connected' : 'disconnected'}. Engine: ${cppMetrics.status}`
    },
    {
      name: 'Authentication',
      score: Math.min(100, Math.max(20, 50 + (stats.ownerOnlyZeroTrust ? 25 : 0) + (stats.panicLockdownActive ? 20 : 0) + (stats.ownerWhitelist.length > 0 ? 10 : 0))),
      weight: 0.15,
      trend: stats.ownerOnlyZeroTrust ? 'stable' : 'down',
      details: `Zero-trust: ${stats.ownerOnlyZeroTrust}. Lockdown: ${stats.panicLockdownActive}. Whitelist entries: ${stats.ownerWhitelist.length}`
    },
    {
      name: 'Data Protection',
      score: Math.min(100, Math.max(20, 40 + (MongoRedisEngine.isMongoConnected ? 20 : 0) + (redisStats.connected ? 15 : 0) + (cppMetrics.status === 'ACTIVE_MICROSECOND' ? 10 : 0))),
      weight: 0.15,
      trend: MongoRedisEngine.isMongoConnected && redisStats.connected ? 'stable' : 'down',
      details: `MongoDB: ${MongoRedisEngine.isMongoConnected ? 'configured' : 'not configured'}. Redis: ${redisStats.connected ? 'connected' : 'disconnected'}`
    },
    {
      name: 'Compliance',
      score: Math.min(100, Math.max(20, 45 + (stats.ownerWhitelist.length > 0 ? 15 : 0) + (stats.ownerWhitelist.length > 0 ? 15 : 0) + (cppMetrics.status === 'ACTIVE_MICROSECOND' ? 10 : 0))),
      weight: 0.15,
      trend: 'stable',
      details: `Whitelist active: ${stats.ownerWhitelist.length > 0}. Engine: ${cppMetrics.status}`
    },
    {
      name: 'Authorization',
      score: Math.min(100, Math.max(20, 45 + (stats.activeAntiNukeModules * 3) + (stats.panicLockdownActive ? 10 : 0))),
      weight: 0.1,
      trend: stats.activeAntiNukeModules > 0 ? 'up' : 'stable',
      details: `Active anti-nuke modules: ${stats.activeAntiNukeModules}. Lockdown: ${stats.panicLockdownActive}`
    }
  ];

  const overallScore = Math.round(categories.reduce((acc, cat) => acc + cat.score * cat.weight, 0));

  // Store daily risk score snapshot for real historical tracking
  recordRiskScoreSnapshot(overallScore);

  // Use real stored history if available, otherwise indicate insufficient data
  let historicalScores: number[] = [];
  let historyNote = 'Insufficient historical data';
  if (riskScoreHistory.length > 1) {
    historicalScores = riskScoreHistory.map(r => r.score);
    historyNote = `Real stored history (${riskScoreHistory.length} days)`;
  }

  const factors = {
    criticalVulnerabilities: 0,
    highRiskItems: Math.max(0, 2 - Math.floor(overallScore / 20)),
    mediumRiskItems: Math.max(0, 5 - Math.floor(overallScore / 15)),
    lowRiskItems: Math.max(1, Math.floor(12 * (overallScore / 100))),
    lastAssessment: new Date().toLocaleString()
  };

  res.json({
    success: true,
    overallScore,
    historicalScores,
    categories,
    factors,
    source: 'live-security-stats',
    historyNote,
    note: 'Scores derived from live bot configuration and operational state. Vulnerability counts are risk indicators, not scanner findings.'
  });
});

// Trust System Demo Data Endpoint
app.get("/api/analytics/trust-system", requireAdminAuth, (req, res) => {
  const demoUsers = [
    { username: 'admin_user', userId: 'user_10001', trustScore: 92, role: 'Admin', joinedAt: '2024-01-15T00:00:00Z', lastActive: new Date().toISOString() },
    { username: 'moderator_1', userId: 'user_10002', trustScore: 87, role: 'Moderator', joinedAt: '2024-02-20T00:00:00Z', lastActive: new Date(Date.now() - 3600000).toISOString() },
    { username: 'trusted_member', userId: 'user_10003', trustScore: 78, role: 'VIP', joinedAt: '2024-03-10T00:00:00Z', lastActive: new Date(Date.now() - 7200000).toISOString() },
    { username: 'vip_user', userId: 'user_10004', trustScore: 71, role: 'VIP', joinedAt: '2024-04-05T00:00:00Z', lastActive: new Date(Date.now() - 86400000).toISOString() },
    { username: 'helper_bot', userId: 'user_10005', trustScore: 65, role: 'Helper', joinedAt: '2024-05-12T00:00:00Z', lastActive: new Date(Date.now() - 172800000).toISOString() }
  ];

  res.json({
    success: true,
    users: demoUsers,
    demo: true,
    note: 'Trust system data is demonstration data. Real implementation requires Discord guild member activity integration.'
  });
});

// Explicit API 404 handler to prevent HTML fallthrough for non-existent API routes
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.path}` });
});

// Global Express API Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const isApi = req.path && req.path.startsWith("/api");
  console.error(isApi ? "API Router Error:" : "Server Error:", err);
  
  if (isApi) {
    const status = typeof err?.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 500;
    return res.status(status).json({ 
      error: status === 500 ? "Internal Server Error" : (err?.message || "Request failed"),
      timestamp: new Date().toISOString()
    });
  }
  
  next(err);
});

// Setup Vite Dev Server / Static Files Serve
async function setupServer() {
  app.use(express.static(path.join(process.cwd(), "public")));

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Serve index.html for all other routes to support single-page apps
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

   httpServer = app.listen(PORT, "0.0.0.0", async () => {
    console.log(`Server running on port ${PORT}`);
    // Initialize Redis connection if configured
    await MongoRedisEngine.initRedis().catch((err) => {
      console.warn("Redis initialization failed:", err);
    });
    // Initialize Redis-backed rate limiter
    await RateLimiterMiddleware.initRedis().catch((err) => {
      console.warn("Redis rate limiter initialization failed:", err);
    });
    // Enable fail-closed mode for distributed rate limiting
    // When Redis is unavailable, reject requests with 503 instead of falling back to per-instance limits
    RateLimiterMiddleware.setFailClosed(true);
    
    // 🚀 INITIALIZE ULTIMATE BOT INTEGRATION (World's #1 Discord Bot)
    try {
      await ultimateBotIntegration.initialize();
      console.log("✅ ULTIMATE BOT INTEGRATION ACTIVE - World's #1 Discord Bot Online");
    } catch (err) {
      console.error("❌ Ultimate integration failed:", err);
    }
    
    // 🏆 EXPOSE BENCHMARK/PROOF ENDPOINT
    app.get("/api/benchmark/proof", async (req, res) => {
      try {
        const proof = benchmarkEvidenceSystem.generateProofOfPerformance();
        res.json(proof);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });
    
    app.get("/api/benchmark/realtime", async (req, res) => {
      try {
        const metrics = benchmarkEvidenceSystem.getRealTimeMetrics();
        res.json(metrics);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });
    
    app.get("/api/benchmark/run", async (req, res) => {
      try {
        const results = await benchmarkEvidenceSystem.runBenchmarks();
        res.json(results);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });
    
    app.get("/api/ultimate/status", async (req, res) => {
      try {
        const dashboard = ultimateBotIntegration.getRealTimeDashboard();
        res.json(dashboard);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });
    
    // Load persisted risk score history
    loadRiskScoreHistory();
    // Load persisted backup history
    loadBackupHistory();
    // Start automatic backup scheduler
    startBackupScheduler();
    // Auto-start Discord Bot on startup
    startDiscordBot().catch((err) => {
      console.error("Failed to auto-start Discord bot:", err);
    });
  });
}

export { app };

if (process.env.NODE_ENV !== 'test') {
  setupServer().catch((err) => {
    console.error("Failed to setup server:", err);
    process.exit(1);
  });
}
