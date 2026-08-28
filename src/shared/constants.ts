/**
 * Centralized constants - replaces all magic numbers throughout the codebase.
 * All security thresholds, time windows, and limits are defined here.
 */

export const SECURITY_CONSTANTS = {
  /** Velocity-based attack detection thresholds */
  velocity: {
    /** Max destructive actions per user in 5 seconds before 100-nuker defense triggers */
    userActionsPer5s: 6,
    /** Max destructive actions per guild in 5 seconds before 100-nuker defense triggers */
    guildActionsPer5s: 12,
    /** Max destructive actions per guild in 3 seconds before panic lockdown */
    guildPanicActionsPer3s: 10,
    /** Max sequential kicks/bans per user in 15 seconds before IP ban */
    sequentialKickBanPer15s: 5,
    /** Max whitelisted admin actions in 10 seconds before compromise detection */
    whitelistedAdminActionsPer10s: 8,
    /** Max whitelisted owner actions in 10 seconds before lockdown */
    ownerActionsPer10s: 3,
    /** Max events per 2 seconds per type (channelCreate, channelDelete, roleCreate, roleDelete) */
    eventVelocityPer2s: 5,
  },

  /** Time windows for velocity tracking (milliseconds) */
  timeWindows: {
    /** User action tracking window */
    velocityWindowMs: 5_000,
    /** Guild burst action tracking window */
    guildBurstWindowMs: 5_000,
    /** Guild panic burst tracking window */
    guildPanicWindowMs: 3_000,
    /** Sequential kick/ban tracking window */
    sequentialWindowMs: 15_000,
    /** Whitelisted admin action tracking window */
    whitelistWindowMs: 10_000,
    /** Owner action tracking window */
    ownerWindowMs: 10_000,
    /** Event velocity tracking window */
    eventVelocityWindowMs: 2_000,
    /** Quarantine cooldown */
    quarantineWindowMs: 60_000,
    /** Default panic lockdown auto-reset */
    lockdownAutoResetMs: 600_000, // 10 minutes
    /** Extended panic lockdown auto-reset */
    extendedLockdownAutoResetMs: 3_600_000, // 1 hour
    /** Memory cleanup interval */
    cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
    /** Max age for global trackers */
    globalTrackerMaxAgeMs: 30 * 60 * 1000, // 30 minutes
  },

  /** Rate limiting defaults */
  rateLimits: {
    /** Default command cooldown (seconds) */
    defaultCommandCooldown: 3,
    /** Global API rate limit (requests per 15 min) */
    apiGlobalPer15min: 150,
    /** AI endpoint rate limit (requests per minute) */
    aiPerMinute: 10,
    /** Heavy operation rate limit (requests per 5 min) */
    heavyOpPer5min: 5,
    /** Login attempts per minute */
    loginPerMinute: 10,
    /** In-memory rate limiter: max actions per 10 seconds */
    inMemoryMaxPer10s: 5,
    /** Redis rate limiter: max actions per 10 seconds */
    redisMaxPer10s: 5,
  },

  /** Map size limits (prevent memory leaks) */
  mapLimits: {
    /** TtlMap default max entries */
    ttlMapDefaultMax: 10_000,
    /** LruMap default max entries */
    lruMapDefaultMax: 10_000,
    /** User risk scores max */
    userRiskScoresMax: 5_000,
    /** Server scores max */
    serverScoresMax: 1_000,
    /** Known threats max */
    knownThreatsMax: 10_000,
    /** Webhook whitelist max */
    webhookWhitelistMax: 5_000,
    /** Invite tracker guilds max */
    inviteTrackerGuildsMax: 1_000,
    /** Session hijack detector max */
    sessionHijackMax: 10_000,
    /** Admin whitelist max (unbounded but small) */
    adminWhitelistMax: 1_000,
    /** Token vault max entries */
    tokenVaultMax: 100,
    /** Snapshot store max per guild */
    snapshotStoreMax: 10,
    /** Backup history max */
    backupHistoryMax: 60,
    /** Latency/throughput history max */
    metricsHistoryMax: 60,
    /** Risk score history max days */
    riskScoreHistoryMaxDays: 30,
    /** Error tracking max */
    errorTrackMax: 1_000,
    /** Audit log max entries */
    auditLogMax: 500,
    /** Bot log max entries */
    botLogMax: 100,
  },

  /** Auto-cleanup intervals (milliseconds) */
  cleanupIntervals: {
    /** Default TtlMap auto-cleanup */
    ttlMapDefault: 30_000,
    /** High-frequency maps */
    highFrequency: 30_000,
    /** Medium-frequency maps */
    mediumFrequency: 60_000,
    /** Low-frequency maps */
    lowFrequency: 300_000,
    /** Very low frequency maps */
    veryLowFrequency: 600_000,
  },

  /** Discord API limits */
  discord: {
    /** Max ban delete message seconds (7 days) */
    maxBanDeleteSeconds: 604_800,
    /** Max timeout duration (28 days in ms) */
    maxTimeoutMs: 28 * 24 * 60 * 60 * 1000,
    /** Max audit log fetch limit */
    auditLogFetchLimit: 25,
    /** Max audit log retry attempts */
    auditLogMaxRetries: 10,
    /** Audit log retry delay */
    auditLogRetryDelayMs: 300,
    /** Max audit log age for matching */
    auditLogMaxAgeMs: 180_000, // 3 minutes
  },

  /** File paths */
  paths: {
    /** Whitelist data file */
    whitelistData: 'whitelist_data.json',
    /** Token vault file */
    tokenVault: 'vault_tokens.json',
    /** Token vault salt file */
    tokenVaultSalt: 'vault_salt.txt',
    /** IP bans file */
    ipBans: 'ip_bans.json',
    /** Verified IPs file */
    verifiedIps: 'verified_ips.json',
    /** Admin sessions file */
    adminSessions: 'admin_sessions.json',
    /** Admin whitelist file */
    adminWhitelist: 'admin_whitelist.json',
    /** Admin audit log file */
    adminAudit: 'admin_audit.json',
    /** Discord config file */
    discordConfig: 'discord_config.json',
    /** Risk score history file */
    riskScoreHistory: 'data/risk_score_history.json',
    /** Backup history file */
    backupHistory: 'data/backup_history.json',
    /** Backup state file */
    backupState: 'data/backup_state.json',
    /** Snapshots directory */
    snapshotsDir: 'snapshots',
    /** Backups directory */
    backupsDir: 'backups',
    /** Data directory */
    dataDir: 'data',
  },

  /** Backup settings */
  backup: {
    /** Auto backup interval (6 hours) */
    intervalMs: 6 * 60 * 60 * 1000,
    /** Max backups per guild */
    maxPerGuild: 5,
    /** Max backup history entries */
    maxHistory: 60,
  },

  /** AI/ML settings */
  ai: {
    /** Sentiment analysis cooldown for normal messages */
    sentimentNormalCooldownMs: 15_000,
    /** Sentiment analysis cooldown for suspicious messages */
    sentimentSuspiciousCooldownMs: 2_000,
    /** Channel sentiment cooldown for normal */
    channelNormalCooldownMs: 10_000,
    /** Channel sentiment cooldown for suspicious */
    channelSuspiciousCooldownMs: 1_000,
    /** Deep scan user cooldown */
    deepScanUserCooldownMs: 10_000,
    /** Deep scan channel cooldown */
    deepScanChannelCooldownMs: 5_000,
    /** Deep scan last scan TTL */
    deepScanTtlMs: 5 * 60 * 1000,
    /** Sentiment last scan TTL */
    sentimentTtlMs: 5 * 60 * 1000,
    /** Server scores TTL */
    serverScoresTtlMs: 30 * 60 * 1000,
    /** Locked channel auto-unlock */
    lockedChannelUnlockMs: 600_000, // 10 minutes
    /** Locked channels TTL */
    lockedChannelsTtlMs: 10 * 60 * 1000,
    /** Heuristic threat score for raid keywords */
    heuristicRaidScore: 40,
    /** Heuristic threat score for clean messages */
    heuristicCleanScore: 5,
  },

  /** Session settings */
  session: {
    /** Admin session TTL (24 hours) */
    adminSessionTtlMs: 24 * 60 * 60 * 1000,
    /** Admin session Redis TTL (seconds) */
    adminSessionRedisTtlSec: 24 * 60 * 60,
    /** Session replay protection window */
    replayWindowMs: 5_000,
    /** Login replay protection window */
    loginReplayWindowMs: 1_000,
    /** Revoked session cleanup interval */
    revokedCleanupIntervalMs: 2 * 60 * 1000,
    /** Revoked session max age */
    revokedMaxAgeMs: 24 * 60 * 60 * 1000,
    /** Expired session cleanup interval */
    expiredCleanupIntervalMs: 10 * 60 * 1000,
  },

  /** Join/raid prediction settings */
  raidPrediction: {
    /** Historical baseline: avg joins per minute */
    avgJoinsPerMinute: 2.5,
    /** Historical baseline: p95 joins per minute */
    p95JoinsPerMinute: 8.0,
    /** Historical baseline: max joins per minute */
    maxJoinsPerMinute: 15.0,
    /** Historical baseline: avg fresh account ratio */
    avgFreshAccountRatio: 0.25,
    /** Historical baseline: p95 fresh account ratio */
    p95FreshAccountRatio: 0.55,
    /** Join history TTL */
    joinHistoryTtlMs: 60_000,
    /** Recent account ages max */
    recentAccountAgesMax: 100,
    /** Very fresh account threshold (days) */
    veryFreshThresholdDays: 1,
    /** Fresh account threshold (days) */
    freshThresholdDays: 7,
    /** Very fresh ratio threshold */
    veryFreshRatioThreshold: 0.4,
  },

  /** Invite tracking */
  invite: {
    /** User invite data TTL (30 days) */
    userInviteTtlMs: 30 * 24 * 60 * 60 * 1000,
    /** Invited by map TTL (30 days) */
    invitedByTtlMs: 30 * 24 * 60 * 60 * 1000,
    /** Fake account threshold (days) */
    fakeAccountThresholdDays: 3,
  },

  /** Quarantine/lockdown */
  quarantine: {
    /** Quarantine role name */
    roleName: 'Quarantine-Jail',
    /** Quarantine role color */
    roleColor: '#010101',
    /** Honeypot role names */
    honeypotRoleNames: [
      'Owner-Pass',
      'Free-Admin',
      'System-Root',
      'Honeypot-Admin',
    ],
  },

  /** Webhook guard */
  webhook: {
    /** Whitelist max entries */
    whitelistMax: 5_000,
  },

  /** Global intelligence */
  globalIntel: {
    /** Known threats max */
    knownThreatsMax: 10_000,
  },

  /** Auto-heal */
  autoHeal: {
    /** Healed channels TTL (24 hours) */
    healedChannelsTtlMs: 24 * 60 * 60 * 1000,
    /** Healed channels max */
    healedChannelsMax: 10_000,
  },

  /** Anti-vanity hijack */
  antiVanity: {
    /** Changed codes TTL (24 hours) */
    changedCodesTtlMs: 24 * 60 * 60 * 1000,
    /** Changed codes max */
    changedCodesMax: 10_000,
  },

  /** Emoji/Sticker protection */
  emojiSticker: {
    /** Known emojis max */
    knownEmojisMax: 10_000,
    /** Known stickers max */
    knownStickersMax: 10_000,
    /** Mass deletion threshold */
    massDeletionThreshold: 5,
  },

  /** Forum protection */
  forum: {
    /** Protected tags max */
    protectedTagsMax: 10_000,
    /** Mass tag change threshold */
    massTagChangeThreshold: 5,
  },

  /** Permission rollback */
  permissionRollback: {
    /** Role permission cache max */
    rolePermissionCacheMax: 10_000,
  },

  /** Temporal raid lock */
  temporalRaidLock: {
    /** Default lock duration (10 minutes) */
    defaultLockDurationMs: 600_000,
    /** Locked guilds TTL */
    lockedGuildsTtlMs: 600_000,
    /** Join history TTL */
    joinHistoryTtlMs: 600_000,
    /** Join history max */
    joinHistoryMax: 10_000,
    /** Lock threshold (joins in 10s) */
    lockThreshold: 10,
  },

  /** Anomaly AI */
  anomalyAI: {
    /** Action history TTL (1 hour) */
    actionHistoryTtlMs: 60 * 60 * 1000,
    /** Action history max */
    actionHistoryMax: 10_000,
    /** Critical nuke threat threshold (actions/sec) */
    criticalThreshold: 5,
    /** Suspicious activity threshold (actions/sec) */
    suspiciousThreshold: 2,
  },

  /** Join limit shield */
  joinLimitShield: {
    /** Threshold (members) */
    threshold: 5,
    /** Window (10 seconds) */
    windowMs: 10_000,
    /** Join history max */
    joinHistoryMax: 10_000,
    /** Raid active TTL */
    raidActiveTtlMs: 10_000,
    /** Raid active max */
    raidActiveMax: 5_000,
  },

  /** Canary token */
  canary: {
    /** Consumed tokens max */
    consumedTokensMax: 10_000,
    /** Token timestamp validity (24 hours) */
    tokenMaxAgeMs: 86_400_000,
    /** Clock skew margin (1 minute) */
    clockSkewMs: 60_000,
  },

  /** Token vault */
  tokenVault: {
    /** PBKDF2 iterations */
    pbkdf2Iterations: 100_000,
    /** Key length (bytes) */
    keyLength: 32,
    /** Hash algorithm */
    hashAlgorithm: 'sha256',
    /** AES algorithm */
    aesAlgorithm: 'aes-256-gcm',
    /** IV length (bytes) */
    ivLength: 12,
  },

  /** Encryption */
  encryption: {
    /** Admin secret min length */
    adminSecretMinLength: 32,
    /** Config encryption algorithm */
    configAlgorithm: 'aes-256-gcm',
    /** Config IV length (bytes) */
    configIvLength: 12,
  },

  /** Health checks */
  health: {
    /** Health check timeout */
    timeoutMs: 10_000,
    /** Graceful shutdown timeout (30 seconds) */
    shutdownTimeoutMs: 30_000,
    /** Process max listeners */
    maxListeners: 20,
  },

  /** HTTP settings */
  http: {
    /** Default port */
    defaultPort: 3000,
    /** Request body limit */
    bodyLimit: '100kb',
    /** GitHub webhook body limit */
    githubWebhookLimit: '100kb',
    /** Helmet CSP script-src unsafe-eval in dev */
    allowUnsafeEvalInDev: true,
  },

  /** UV thread pool */
  uv: {
    /** Default thread pool size */
    defaultThreadPoolSize: 4,
    /** Production thread pool size */
    productionThreadPoolSize: 128,
  },

  /** Logging */
  logging: {
    /** Structured log level */
    level: process.env.LOG_LEVEL || 'info',
    /** Pretty print in development */
    prettyPrint: process.env.NODE_ENV !== 'production',
  },
} as const;

// Type-safe access to constants
export type SecurityConstants = typeof SECURITY_CONSTANTS;
export type VelocityThresholds = typeof SECURITY_CONSTANTS.velocity;
export type TimeWindows = typeof SECURITY_CONSTANTS.timeWindows;
export type RateLimits = typeof SECURITY_CONSTANTS.rateLimits;
export type MapLimits = typeof SECURITY_CONSTANTS.mapLimits;