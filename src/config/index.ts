/**
 * Centralized Configuration System
 * Single source of truth for all configuration with schema validation
 */

import { z } from "zod";

// ============================================================
// Environment Schema
// ============================================================

const EnvSchema = z.object({
  // Discord
  DISCORD_BOT_TOKEN: z.string().min(50, "Invalid Discord bot token"),
  DISCORD_CLIENT_ID: z.string().min(17).max(20),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  
  // API Keys
  GEMINI_API_KEY: z.string().min(32).optional(),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  
  // Security
  ADMIN_SECRET: z.string().min(32, "ADMIN_SECRET must be at least 32 characters"),
  
  // Database
  REDIS_URL: z.string().url().optional(),
  MONGODB_URI: z.string().url().optional(),
  
  // Server
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  ALLOWED_ORIGIN: z.string().url().optional(),
  APP_URL: z.string().url().optional(),
  TRUST_PROXY: z.string().optional(),
  
  // Logging
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  
  // Features
  ENABLE_NATIVE_ENGINE: z.coerce.boolean().default(true),
  ENABLE_WORKER_THREADS: z.coerce.boolean().default(true),
  ENABLE_METRICS: z.coerce.boolean().default(true),
  ENABLE_TRACING: z.coerce.boolean().default(false),
});

// ============================================================
// Security Thresholds Configuration
// ============================================================

const SecurityThresholdsSchema = z.object({
  // Velocity thresholds
  maxChannelCreatesPerWindow: z.number().default(5),
  channelCreateWindowMs: z.number().default(10000),
  maxRoleModifiesPerWindow: z.number().default(3),
  roleModifyWindowMs: z.number().default(10000),
  maxPermissionEscalationsPerWindow: z.number().default(1),
  permissionEscalationWindowMs: z.number().default(60000),
  maxBanKicksPerWindow: z.number().default(5),
  banKickWindowMs: z.number().default(10000),
  maxWebhooksPerWindow: z.number().default(2),
  webhookWindowMs: z.number().default(10000),
  maxBotAdditionsPerWindow: z.number().default(3),
  botAdditionWindowMs: z.number().default(10000),
  maxBurstEventsPerWindow: z.number().default(10),
  burstWindowMs: z.number().default(5000),
  
  // Score thresholds
  quarantineThreshold: z.number().default(50),
  lockdownThreshold: z.number().default(80),
  criticalThreshold: z.number().default(90),
  
  // Sequential actions
  maxSequentialKickBans: z.number().default(5),
  sequentialWindowMs: z.number().default(15000),
  
  // Whitelist velocity
  maxWhitelistActionsPerWindow: z.number().default(8),
  whitelistWindowMs: z.number().default(10000),
  maxOwnerActionsPerWindow: z.number().default(3),
  ownerWindowMs: z.number().default(10000),
  
  // Raid detection
  raidActionThreshold: z.number().default(50),
  raidWindowMs: z.number().default(10000),
  
  // Panic lockdown
  panicLockdownDurationMs: z.number().default(600000),
  panicBurstThreshold: z.number().default(10),
  panicBurstWindowMs: z.number().default(3000),
});

// ============================================================
// Rate Limiting Configuration
// ============================================================

const RateLimitSchema = z.object({
  global: z.object({
    windowMs: z.number().default(15 * 60 * 1000),
    maxRequests: z.number().default(150),
  }),
  aiEndpoints: z.object({
    windowMs: z.number().default(60 * 1000),
    maxRequests: z.number().default(10),
  }),
  heavyOperations: z.object({
    windowMs: z.number().default(5 * 60 * 1000),
    maxRequests: z.number().default(5),
  }),
  login: z.object({
    windowMs: z.number().default(60 * 1000),
    maxRequests: z.number().default(10),
  }),
  authApi: z.object({
    windowMs: z.number().default(60 * 1000),
    maxRequests: z.number().default(30),
  }),
});

// ============================================================
// Token Vault Configuration
// ============================================================

const TokenVaultSchema = z.object({
  maxEntries: z.number().default(100),
  keyRotationIntervalMs: z.number().default(30 * 24 * 60 * 60 * 1000),
  argon2MemoryCost: z.number().default(65536),
  argon2TimeCost: z.number().default(3),
  argon2Parallelism: z.number().default(4),
  redisEnabled: z.boolean().default(true),
});

// ============================================================
// Behavior Scoring Configuration
// ============================================================

const BehaviorScoringSchema = z.object({
  maxEntries: z.number().default(50000),
  ttlMs: z.number().default(7 * 24 * 60 * 60 * 1000),
  warningThreshold: z.number().default(40000),
  decayPointsPerHour: z.number().default(1),
});

// ============================================================
// C++ Engine Configuration
// ============================================================

const CppEngineSchema = z.object({
  nativeModulePaths: z.array(z.string()).default([
    "./build/Release/security_engine.node",
    "./build/Debug/security_engine.node",
    "../build/Release/security_engine.node",
    "../build/Debug/security_engine.node",
  ]),
  workerThreadPath: z.string().default("./EngineWorker.ts"),
  fallbackMemoryMB: z.number().default(16),
  maxRestartAttempts: z.number().default(5),
  restartBackoffMs: z.number().default(1000),
});

// ============================================================
// Backup Configuration
// ============================================================

const BackupSchema = z.object({
  intervalMs: z.number().default(6 * 60 * 60 * 1000),
  maxBackups: z.number().default(30),
  snapshotIntervalMs: z.number().default(24 * 60 * 60 * 1000),
  retentionDays: z.number().default(30),
  integrityCheckEnabled: z.boolean().default(true),
});

// ============================================================
// Main Config Schema
// ============================================================

const ConfigSchema = z.object({
  env: EnvSchema,
  security: SecurityThresholdsSchema,
  rateLimit: RateLimitSchema,
  tokenVault: TokenVaultSchema,
  behaviorScoring: BehaviorScoringSchema,
  cppEngine: CppEngineSchema,
  backup: BackupSchema,
});

// ============================================================
// Configuration Loader
// ============================================================

type EnvConfig = z.infer<typeof EnvSchema>;
type SecurityThresholdsConfig = z.infer<typeof SecurityThresholdsSchema>;
type RateLimitConfig = z.infer<typeof RateLimitSchema>;
type TokenVaultConfig = z.infer<typeof TokenVaultSchema>;
type BehaviorScoringConfig = z.infer<typeof BehaviorScoringSchema>;
type CppEngineConfig = z.infer<typeof CppEngineSchema>;
type BackupConfig = z.infer<typeof BackupSchema>;

export interface Config {
  env: EnvConfig;
  security: SecurityThresholdsConfig;
  rateLimit: RateLimitConfig;
  tokenVault: TokenVaultConfig;
  behaviorScoring: BehaviorScoringConfig;
  cppEngine: CppEngineConfig;
  backup: BackupConfig;
}

let configInstance: Config | null = null;

export function loadConfig(): Config {
  if (configInstance) return configInstance;

  // Parse environment variables
  const envResult = EnvSchema.safeParse(process.env);
  if (!envResult.success) {
    const errors = envResult.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("\n");
    throw new Error(`Environment validation failed:\n${errors}`);
  }

  // Build full config with defaults
  const config: Config = {
    env: envResult.data,
    security: SecurityThresholdsSchema.parse({}),
    rateLimit: RateLimitSchema.parse({}),
    tokenVault: TokenVaultSchema.parse({}),
    behaviorScoring: BehaviorScoringSchema.parse({}),
    cppEngine: CppEngineSchema.parse({}),
    backup: BackupSchema.parse({}),
  };

  configInstance = config;
  return config;
}

export function getConfig(): Config {
  if (!configInstance) {
    return loadConfig();
  }
  return configInstance;
}

export function resetConfig(): void {
  configInstance = null;
}

// ============================================================
// Type-safe config accessors
// ============================================================

export const config = {
  get env() { return getConfig().env; },
  get security() { return getConfig().security; },
  get rateLimit() { return getConfig().rateLimit; },
  get tokenVault() { return getConfig().tokenVault; },
  get behaviorScoring() { return getConfig().behaviorScoring; },
  get cppEngine() { return getConfig().cppEngine; },
  get backup() { return getConfig().backup; },
};

// Export schemas for testing/validation
export {
  EnvSchema,
  SecurityThresholdsSchema,
  RateLimitSchema,
  TokenVaultSchema,
  BehaviorScoringSchema,
  CppEngineSchema,
  BackupSchema,
  ConfigSchema,
};