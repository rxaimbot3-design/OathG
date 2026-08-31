// ==================== SECURITY THRESHOLDS & CONSTANTS ====================
// Centralized configuration for all security thresholds to avoid magic numbers

export const SECURITY_THRESHOLDS = {
  // Whitelist Compromise Prevention
  WHITELIST_ACTION_WINDOW_MS: 10_000,      // 10 second sliding window
  WHITELIST_MAX_ACTIONS: 8,                 // Max actions before lockdown
  WHITELIST_OWNER_MAX_ACTIONS: 3,           // Owner max actions before lockdown
  
  // 100-Nuker Simultaneous Attack Defense
  NUKER_USER_ACTION_WINDOW_MS: 5_000,       // 5 second window for user actions
  NUKER_USER_MAX_ACTIONS: 6,                // Max user actions in window
  NUKER_GUILD_ACTION_WINDOW_MS: 5_000,      // 5 second window for guild actions
  NUKER_GUILD_MAX_ACTIONS: 12,              // Max guild actions in window
  NUKER_PANIC_GUILD_ACTION_WINDOW_MS: 3_000, // 3 second window for panic
  NUKER_PANIC_GUILD_MAX_ACTIONS: 10,        // Max guild actions for panic
  
  // Sequential Kick/Ban Velocity Tracker
  SEQUENTIAL_KICK_BAN_WINDOW_MS: 15_000,    // 15 second window
  SEQUENTIAL_KICK_BAN_MAX_ACTIONS: 5,       // Max sequential kicks/bans
  
  // Mass Ban Detection
  MASS_BAN_WINDOW_MS: 10_000,               // 10 second window
  MASS_BAN_THRESHOLD: 3,                    // 3+ bans in window
  
  // Anti-Spam
  SPAM_WINDOW_MS: 6_000,                    // 6 second window
  SPAM_MAX_MESSAGES: 4,                     // Max messages in window
  
  // Anti-Link/NSFW Violations
  VIOLATION_WINDOW_MS: 10 * 60 * 1000,      // 10 minutes
  VIOLATION_MAX_COUNT: 3,                   // Max violations before timeout
  
  // Join/Leave Velocity
  JOIN_VELOCITY_WINDOW_MS: 10_000,          // 10 second window
  JOIN_VELOCITY_THRESHOLD: 5,               // 5+ joins in window
  LEAVE_VELOCITY_WINDOW_MS: 10_000,         // 10 second window
  LEAVE_VELOCITY_THRESHOLD: 5,              // 5+ leaves in window
  
  // Raid Detection
  RAID_ACTION_THRESHOLD: 50,                // 50 actions in 10s
  
  // Event Velocity (Channel/Role Create/Delete)
  EVENT_VELOCITY_WINDOW_MS: 2_000,          // 2 second window
  EVENT_VELOCITY_THRESHOLD: 5,              // 5+ events in window
  
  // Quarantine Lock Duration
  QUARANTINE_LOCK_DURATION_MS: 60_000,      // 1 minute
  
  // Panic Lockdown Durations
  PANIC_LOCKDOWN_DEFAULT_MS: 10 * 60 * 1000,    // 10 minutes
  PANIC_LOCKDOWN_EXTENDED_MS: 60 * 60 * 1000,   // 1 hour
  
  // Timeout Durations
  SPAM_TIMEOUT_MS: 60 * 60 * 1000,          // 1 hour
  LINK_NSFW_TIMEOUT_MS: 60 * 60 * 1000,     // 1 hour
  VIOLATION_TIMEOUT_MS: 60 * 60 * 1000,     // 1 hour
  KICK_BAN_TIMEOUT_MS: 28 * 24 * 60 * 60 * 1000, // 28 days
  
  // Cleanup Intervals
  MEMORY_CLEANUP_INTERVAL_MS: 5 * 60 * 1000,     // 5 minutes
  GLOBAL_TRACKER_CLEANUP_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
  GLOBAL_TRACKER_MAX_AGE_MS: 30 * 60 * 1000,   // 30 minutes
  SPAM_TRACKER_MAX_AGE_MS: 60_000,             // 1 minute
  VIOLATION_MAX_AGE_MS: 3_600_000,             // 1 hour
  USER_ACTION_MAX_AGE_MS: 60_000,              // 1 minute
  GUILD_ACTION_MAX_AGE_MS: 60_000,             // 1 minute
  WHITELIST_ACTION_MAX_AGE_MS: 10_000,         // 10 seconds
  RECENT_PROCESSED_KICKS_TTL_MS: 30_000,       // 30 seconds
  BOT_MEMORY_TTL_MS: 30_000,                   // 30 seconds
  BOT_CREATING_TTL_MS: 10_000,                 // 10 seconds
  
  // Audit Log Fetch
  AUDIT_LOG_MAX_AGE_MS: 180_000,          // 3 minutes
  AUDIT_LOG_RETRY_COUNT: 15,
  AUDIT_LOG_RETRY_DELAY_MS: 300,
  
  // Backup
  AUTO_BACKUP_INTERVAL_MS: 15 * 60 * 1000,    // 15 minutes
  DAILY_BACKUP_INTERVAL_MS: 24 * 60 * 60 * 1000, // 24 hours
  SERVER_BACKUP_MAX_COUNT: 30,
  
  // Presence Rotator
  PRESENCE_ROTATOR_INTERVAL_MS: 30_000,       // 30 seconds
  
  // Active Sweep
  ACTIVE_SWEEP_INTERVAL_MS: 10 * 60 * 1000,   // 10 minutes
  
  // Rate Limits
  COMMAND_COOLDOWN_SECONDS: 3,
  COMMAND_COOLDOWN_CLEANUP_MS: 60_000,        // 1 minute
  
  // Login
  LOGIN_TIMEOUT_MS: 90_000,                   // 90 seconds
  LOGIN_RETRY_DELAY_MS: 5_000,                // 5 seconds
  
  // File Paths
  DATA_FILE: "whitelist_data.json",
  IP_BANS_FILE: "ip_bans.json",
  VERIFIED_IPS_FILE: "verified_ips.json",
  SESSIONS_FILE: "admin_sessions.json",
  ADMIN_AUDIT_FILE: "admin_audit.json",
  BACKUP_HISTORY_FILE: "data/backup_history.json",
  BACKUP_STATE_FILE: "data/backup_state.json",
  RISK_HISTORY_FILE: "data/risk_score_history.json",
  
  // Limits
  MAX_BOT_LOGS: 100,
  MAX_ADMIN_AUDIT_LOGS: 10_000,
  MAX_RECENT_ERRORS: 1_000,
  MAX_HISTORY_ENTRIES: 60,
  MAX_RISK_HISTORY: 30,
  MAX_COMMAND_COOLDOWN_ENTRIES: 1000,
  
  // Discord Limits
  MAX_EMBED_FIELDS: 24,
  MAX_EMBED_TITLE_LENGTH: 250,
  MAX_EMBED_DESCRIPTION_LENGTH: 3_900,
  MAX_EMBED_FIELD_NAME_LENGTH: 250,
  MAX_EMBED_FIELD_VALUE_LENGTH: 1_020,
  MAX_EMBED_FOOTER_LENGTH: 200,
  MAX_EMBED_AUTHOR_LENGTH: 250,
  
  // Message Sanitization
  MAX_SANITIZE_LENGTH: 2_000,
} as const;

export type SecurityThresholds = typeof SECURITY_THRESHOLDS;