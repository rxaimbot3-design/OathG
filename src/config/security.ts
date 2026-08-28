/**
 * Security Configuration System
 * 
 * Centralized, validated, and type-safe configuration for all security modules.
 * Supports per-guild overrides via database (future) and environment variables.
 */

import { SECURITY_CONSTANTS, type SecurityConstants } from '../shared/constants.js';

/** Per-guild security configuration override */
export interface GuildSecurityConfig {
  /** Guild ID this config applies to */
  guildId: string;
  /** Custom velocity thresholds */
  velocity?: Partial<SecurityConstants['velocity']>;
  /** Custom time windows */
  timeWindows?: Partial<SecurityConstants['timeWindows']>;
  /** Custom rate limits */
  rateLimits?: Partial<SecurityConstants['rateLimits']>;
  /** Feature toggles */
  features?: {
    /** Enable 100-nuker defense */
    hundredNukerDefense?: boolean;
    /** Enable panic lockdown */
    panicLockdown?: boolean;
    /** Enable IP ban system */
    ipBanSystem?: boolean;
    /** Enable quarantine */
    quarantine?: boolean;
    /** Enable sentiment tracking */
    sentimentTracking?: boolean;
    /** Enable AI raid prediction */
    aiRaidPrediction?: boolean;
    /** Enable webhook guard */
    webhookGuard?: boolean;
    /** Enable auto-heal */
    autoHeal?: boolean;
    /** Enable join limit shield */
    joinLimitShield?: boolean;
    /** Enable invite tracking */
    inviteTracking?: boolean;
    /** Enable anti-phishing */
    antiPhishing?: boolean;
    /** Enable anti-invite shield */
    antiInviteShield?: boolean;
    /** Enable honeypot admin role */
    honeypotAdminRole?: boolean;
    /** Enable session hijack detection */
    sessionHijackDetection?: boolean;
    /** Enable OAuth malicious app detection */
    oauthMaliciousAppDetection?: boolean;
    /** Enable auto permission rollback */
    autoPermissionRollback?: boolean;
    /** Enable server snapshot restore */
    serverSnapshotRestore?: boolean;
    /** Enable anti-vanity hijack */
    antiVanityHijack?: boolean;
    /** Enable emoji/sticker protection */
    emojiStickerProtection?: boolean;
    /** Enable forum channel protection */
    forumChannelProtection?: boolean;
    /** Enable anomaly AI */
    anomalyAI?: boolean;
    /** Enable temporal raid lock */
    temporalRaidLock?: boolean;
    /** Enable behavior scoring */
    behaviorScoring?: boolean;
    /** Enable global intelligence */
    globalIntelligence?: boolean;
    /** Enable canary token */
    canaryToken?: boolean;
    /** Enable token vault */
    tokenVault?: boolean;
    /** Enable bot token rotation */
    botTokenRotation?: boolean;
    /** Enable premium license system */
    premiumLicense?: boolean;
    /** Enable admin whitelist system */
    adminWhitelist?: boolean;
  };
  /** Custom thresholds for specific actions */
  thresholds?: {
    /** Max channels created per minute */
    maxChannelCreatesPerMin?: number;
    /** Max channels deleted per minute */
    maxChannelDeletesPerMin?: number;
    /** Max roles created per minute */
    maxRoleCreatesPerMin?: number;
    /** Max roles deleted per minute */
    maxRoleDeletesPerMin?: number;
    /** Max bans per minute */
    maxBansPerMin?: number;
    /** Max kicks per minute */
    maxKicksPerMin?: number;
    /** Max webhooks created per minute */
    maxWebhooksPerMin?: number;
    /** Max invites created per minute */
    maxInvitesPerMin?: number;
  };
  /** Whitelist/blacklist configuration */
  lists?: {
    /** Additional whitelisted user IDs */
    extraWhitelistedUsers?: string[];
    /** Additional whitelisted bot IDs */
    extraWhitelistedBots?: string[];
    /** Blocked user IDs */
    blockedUsers?: string[];
    /** Blocked IP addresses */
    blockedIPs?: string[];
    /** Allowed IP ranges (CIDR) */
    allowedIPRanges?: string[];
  };
  /** AI configuration */
  ai?: {
    /** Enable AI deep scan */
    deepScanEnabled?: boolean;
    /** Deep scan threshold (0-100) */
    deepScanThreshold?: number;
    /** Sentiment analysis enabled */
    sentimentEnabled?: boolean;
    /** Sentiment lockdown threshold */
    sentimentLockdownThreshold?: number;
    /** Raid prediction enabled */
    raidPredictionEnabled?: boolean;
    /** Raid prediction alert threshold */
    raidAlertThreshold?: number;
  };
  /** Logging configuration */
  logging?: {
    /** Log level for this guild */
    level?: 'debug' | 'info' | 'warn' | 'error';
    /** Enable audit logging */
    auditLogEnabled?: boolean;
    /** Enable live audit alerts */
    liveAuditAlerts?: boolean;
    /** Custom log channel ID */
    customLogChannelId?: string;
  };
}

/** Complete security configuration */
export interface SecurityConfig {
  /** Global defaults (from constants) */
  defaults: SecurityConstants;
  /** Per-guild overrides */
  guildOverrides: Map<string, GuildSecurityConfig>;
  /** Feature flags */
  features: {
    /** Enable all security modules */
    allEnabled: boolean;
    /** Individual feature flags */
    [key: string]: boolean;
  };
  /** Environment-specific overrides */
  envOverrides: Partial<SecurityConstants>;
}

/** Configuration loader options */
export interface ConfigLoaderOptions {
  /** Path to config file (optional) */
  configPath?: string;
  /** Environment prefix for overrides */
  envPrefix?: string;
  /** Validate on load */
  validate?: boolean;
}

/**
 * Security Configuration Manager
 * 
 * Loads, validates, and provides access to security configuration.
 * Supports hot-reloading and per-guild overrides.
 */
export class SecurityConfigManager {
  private config: SecurityConfig;
  private configPath: string;
  private envPrefix: string;
  private watchers: Set<() => void> = new Set();

  constructor(options: ConfigLoaderOptions = {}) {
    this.configPath = options.configPath || '';
    this.envPrefix = options.envPrefix || 'SECURITY_';
    this.config = this.createDefaultConfig();
    
    if (options.validate !== false) {
      this.loadFromEnvironment();
      this.validate();
    }
  }

  /** Create default configuration from constants */
  private createDefaultConfig(): SecurityConfig {
    const defaults = { ...SECURITY_CONSTANTS };
    
    // Deep clone nested objects
    const clonedDefaults = JSON.parse(JSON.stringify(defaults)) as SecurityConstants;
    
    return {
      defaults: clonedDefaults,
      guildOverrides: new Map(),
      features: {
        allEnabled: true,
        hundredNukerDefense: true,
        panicLockdown: true,
        ipBanSystem: true,
        quarantine: true,
        sentimentTracking: true,
        aiRaidPrediction: true,
        webhookGuard: true,
        autoHeal: true,
        joinLimitShield: true,
        inviteTracking: true,
        antiPhishing: true,
        antiInviteShield: true,
        honeypotAdminRole: true,
        sessionHijackDetection: true,
        oauthMaliciousAppDetection: true,
        autoPermissionRollback: true,
        serverSnapshotRestore: true,
        antiVanityHijack: true,
        emojiStickerProtection: true,
        forumChannelProtection: true,
        anomalyAI: true,
        temporalRaidLock: true,
        behaviorScoring: true,
        globalIntelligence: true,
        canaryToken: true,
        tokenVault: true,
        botTokenRotation: true,
        premiumLicense: true,
        adminWhitelist: true,
      },
      envOverrides: {},
    };
  }

  /** Load configuration from environment variables */
  private loadFromEnvironment(): void {
    const env = process.env;
    const overrides: Partial<SecurityConstants> = {};

    // Load velocity thresholds
    if (env[`${this.envPrefix}USER_ACTIONS_PER_5S`]) {
      overrides.velocity = {
        ...overrides.velocity,
        userActionsPer5s: parseInt(env[`${this.envPrefix}USER_ACTIONS_PER_5S`]!, 10),
      };
    }
    if (env[`${this.envPrefix}GUILD_ACTIONS_PER_5S`]) {
      overrides.velocity = {
        ...overrides.velocity,
        guildActionsPer5s: parseInt(env[`${this.envPrefix}GUILD_ACTIONS_PER_5S`]!, 10),
      };
    }
    if (env[`${this.envPrefix}SEQUENTIAL_KICK_BAN_PER_15S`]) {
      overrides.velocity = {
        ...overrides.velocity,
        sequentialKickBanPer15s: parseInt(env[`${this.envPrefix}SEQUENTIAL_KICK_BAN_PER_15S`]!, 10),
      };
    }

    // Load time windows
    if (env[`${this.envPrefix}VELOCITY_WINDOW_MS`]) {
      overrides.timeWindows = {
        ...overrides.timeWindows,
        velocityWindowMs: parseInt(env[`${this.envPrefix}VELOCITY_WINDOW_MS`]!, 10),
      };
    }
    if (env[`${this.envPrefix}LOCKDOWN_AUTO_RESET_MS`]) {
      overrides.timeWindows = {
        ...overrides.timeWindows,
        lockdownAutoResetMs: parseInt(env[`${this.envPrefix}LOCKDOWN_AUTO_RESET_MS`]!, 10),
      };
    }

    // Load rate limits
    if (env[`${this.envPrefix}API_GLOBAL_PER_15MIN`]) {
      overrides.rateLimits = {
        ...overrides.rateLimits,
        apiGlobalPer15min: parseInt(env[`${this.envPrefix}API_GLOBAL_PER_15MIN`]!, 10),
      };
    }
    if (env[`${this.envPrefix}AI_PER_MINUTE`]) {
      overrides.rateLimits = {
        ...overrides.rateLimits,
        aiPerMinute: parseInt(env[`${this.envPrefix}AI_PER_MINUTE`]!, 10),
      };
    }

    // Load feature flags
    const featureFlags = [
      'hundredNukerDefense', 'panicLockdown', 'ipBanSystem', 'quarantine',
      'sentimentTracking', 'aiRaidPrediction', 'webhookGuard', 'autoHeal',
      'joinLimitShield', 'inviteTracking', 'antiPhishing', 'antiInviteShield',
      'honeypotAdminRole', 'sessionHijackDetection', 'oauthMaliciousAppDetection',
      'autoPermissionRollback', 'serverSnapshotRestore', 'antiVanityHijack',
      'emojiStickerProtection', 'forumChannelProtection', 'anomalyAI',
      'temporalRaidLock', 'behaviorScoring', 'globalIntelligence', 'canaryToken',
      'tokenVault', 'botTokenRotation', 'premiumLicense', 'adminWhitelist',
    ];

    for (const flag of featureFlags) {
      const envKey = `${this.envPrefix}${flag.toUpperCase()}`;
      if (env[envKey] !== undefined) {
        this.config.features[flag] = env[envKey] === 'true' || env[envKey] === '1';
      }
    }

    // Load thresholds
    const thresholdKeys = [
      'maxChannelCreatesPerMin', 'maxChannelDeletesPerMin', 'maxRoleCreatesPerMin',
      'maxRoleDeletesPerMin', 'maxBansPerMin', 'maxKicksPerMin',
      'maxWebhooksPerMin', 'maxInvitesPerMin',
    ];

    for (const key of thresholdKeys) {
      const envKey = `${this.envPrefix}${key.toUpperCase()}`;
      if (env[envKey]) {
        overrides.rateLimits = overrides.rateLimits || {};
        (overrides.rateLimits as any)[key] = parseInt(env[envKey]!, 10);
      }
    }

    this.config.envOverrides = overrides;
  }

  /** Load guild-specific configuration from database (placeholder) */
  async loadGuildConfig(guildId: string): Promise<GuildSecurityConfig | null> {
    // TODO: Implement database loading
    // For now, return null to use defaults
    return null;
  }

  /** Save guild-specific configuration to database (placeholder) */
  async saveGuildConfig(config: GuildSecurityConfig): Promise<void> {
    // TODO: Implement database saving
    this.config.guildOverrides.set(config.guildId, config);
    this.notifyWatchers();
  }

  /** Get effective configuration for a guild */
  getGuildConfig(guildId: string): GuildSecurityConfig {
    const override = this.config.guildOverrides.get(guildId);
    if (override) return override;
    
    // Return default config
    return {
      guildId,
      velocity: {},
      timeWindows: {},
      rateLimits: {},
      features: {},
      thresholds: {},
      lists: {},
      ai: {},
      logging: {},
    };
  }

  /** Get merged configuration for a guild (defaults + overrides) */
  getMergedConfig(guildId: string): SecurityConstants {
    const guildConfig = this.getGuildConfig(guildId);
    const envOverrides = this.config.envOverrides;
    
    return this.mergeConfigs(
      this.config.defaults,
      envOverrides,
      guildConfig.velocity,
      guildConfig.timeWindows,
      guildConfig.rateLimits
    );
  }

  /** Deep merge multiple config objects */
  private mergeConfigs(
    base: SecurityConstants,
    ...overrides: Array<Partial<SecurityConstants> | undefined>
  ): SecurityConstants {
    const result = JSON.parse(JSON.stringify(base)) as SecurityConstants;
    
    for (const override of overrides) {
      if (!override) continue;
      this.deepMerge(result, override);
    }
    
    return result;
  }

  /** Deep merge helper */
  private deepMerge(target: any, source: any): void {
    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target[key];
      
      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        this.deepMerge(targetValue, sourceValue);
      } else if (sourceValue !== undefined) {
        target[key] = sourceValue;
      }
    }
  }

  /** Validate configuration */
  private validate(): void {
    const errors: string[] = [];

    // Validate required environment variables
    if (!process.env.ADMIN_SECRET || process.env.ADMIN_SECRET.length < SECURITY_CONSTANTS.encryption.adminSecretMinLength) {
      errors.push(`ADMIN_SECRET must be at least ${SECURITY_CONSTANTS.encryption.adminSecretMinLength} characters`);
    }

    // Validate numeric values
    if (this.config.envOverrides.velocity?.userActionsPer5s !== undefined) {
      const val = this.config.envOverrides.velocity.userActionsPer5s;
      if (val < 1 || val > 100) errors.push('USER_ACTIONS_PER_5S must be between 1 and 100');
    }

    if (this.config.envOverrides.timeWindows?.lockdownAutoResetMs !== undefined) {
      const val = this.config.envOverrides.timeWindows.lockdownAutoResetMs;
      if (val < 60_000 || val > 86_400_000) errors.push('LOCKDOWN_AUTO_RESET_MS must be between 60000 and 86400000');
    }

    if (errors.length > 0) {
      throw new Error(`Security configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  /** Get a specific constant value (with env/guild overrides) */
  get<K extends keyof SecurityConstants>(
    guildId: string | null,
    category: K,
    key: keyof SecurityConstants[K]
  ): SecurityConstants[K][keyof SecurityConstants[K]] {
    if (guildId) {
      const merged = this.getMergedConfig(guildId);
      return merged[category][key];
    }
    // Global default with env override
    const envOverride = this.config.envOverrides[category] as any;
    if (envOverride && key in envOverride) {
      return envOverride[key];
    }
    return this.config.defaults[category][key];
  }

  /** Get all defaults (with env overrides) */
  getDefaults(): SecurityConstants {
    return this.mergeConfigs(this.config.defaults, this.config.envOverrides);
  }

  /** Check if a feature is enabled */
  isFeatureEnabled(feature: string, guildId?: string): boolean {
    if (!this.config.features.allEnabled) return false;
    if (guildId) {
      const guildConfig = this.getGuildConfig(guildId);
      if (guildConfig.features && feature in guildConfig.features) {
        return guildConfig.features[feature as keyof GuildSecurityConfig['features']] ?? true;
      }
    }
    return this.config.features[feature] ?? true;
  }

  /** Enable/disable a feature globally */
  setFeature(feature: string, enabled: boolean): void {
    this.config.features[feature] = enabled;
    this.notifyWatchers();
  }

  /** Subscribe to config changes */
  subscribe(callback: () => void): () => void {
    this.watchers.add(callback);
    return () => this.watchers.delete(callback);
  }

  /** Notify all watchers */
  private notifyWatchers(): void {
    for (const watcher of this.watchers) {
      try {
        watcher();
      } catch (err) {
        console.error('[SecurityConfig] Watcher error:', err);
      }
    }
  }

  /** Reload configuration from environment */
  reload(): void {
    this.loadFromEnvironment();
    this.validate();
    this.notifyWatchers();
  }

  /** Export configuration for debugging */
  toJSON(): object {
    return {
      defaults: this.config.defaults,
      envOverrides: this.config.envOverrides,
      features: this.config.features,
      guildOverridesCount: this.config.guildOverrides.size,
    };
  }
}

/** Singleton instance */
let configManagerInstance: SecurityConfigManager | null = null;

/** Get or create the global security config manager */
export function getSecurityConfig(options?: ConfigLoaderOptions): SecurityConfigManager {
  if (!configManagerInstance) {
    configManagerInstance = new SecurityConfigManager(options);
  }
  return configManagerInstance;
}

/** Reset the singleton (for testing) */
export function resetSecurityConfig(): void {
  configManagerInstance = null;
}

/** Convenience function to get merged config for a guild */
export function getGuildSecurityConfig(guildId: string): SecurityConstants {
  return getSecurityConfig().getMergedConfig(guildId);
}

/** Convenience function to check feature flag */
export function isSecurityFeatureEnabled(feature: string, guildId?: string): boolean {
  return getSecurityConfig().isFeatureEnabled(feature, guildId);
}