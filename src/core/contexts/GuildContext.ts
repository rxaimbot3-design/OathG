/**
 * GuildContext - Per-guild container for security module access.
 * All modules are singletons with per-guild data stored internally.
 * This context provides a clean API for guild-specific operations.
 */

import type { Guild, Message, GuildMember } from "discord.js";
import type { BotContext } from "./BotContext";
import { GuildStateStore } from "./GuildStateStore";

import { NukeDefense } from "../../security/modules/nuke-defense.js";
import { AuditLogMonitor } from "../../security/modules/audit-log-monitor.js";
import { IPBanSystem } from "../../security/modules/ip-ban-system.js";
import { RateLimiter } from "../../security/modules/rate-limiter.js";
import { SentimentTracker } from "../../security/modules/sentiment-tracker.js";
import { JoinLimitShield } from "../../security/modules/join-limit-shield.js";
import { WebhookGuard } from "../../security/modules/webhook-guard.js";
import { AutoHeal } from "../../security/modules/auto-heal.js";
import { Quarantine } from "../../security/modules/quarantine.js";
import { TemporalRaidLock } from "../../security/modules/temporal-raid-lock.js";
import { BehaviorScoring } from "../../security/modules/behavior-scoring.js";
import { SessionHijackDetector } from "../../security/modules/session-hijack-detector.js";
import { OAuthMaliciousAppDetector } from "../../security/modules/oauth-malicious-app-detector.js";
import { AutoPermissionRollback } from "../../security/modules/auto-permission-rollback.js";
import { ServerSnapshotRestore } from "../../security/modules/server-snapshot-restore.js";
import { AntiVanityHijack } from "../../security/modules/anti-vanity-hijack.js";
import { EmojiStickerProtection } from "../../security/modules/emoji-sticker-protection.js";
import { ForumChannelProtection } from "../../security/modules/forum-channel-protection.js";
import { AIRaidPrediction } from "../../security/modules/ai-raid-prediction.js";
import { HoneypotAdminRole } from "../../security/modules/honeypot-admin-role.js";
import { AntiInviteShield } from "../../security/modules/anti-invite-shield.js";
import { InviteTrackerEngine } from "../../security/modules/invite-tracker-engine.js";

import { botContext } from "./BotContext";

// ============================================================
// GuildContext Implementation
// ============================================================

export class GuildContext {
  readonly guild: Guild;
  readonly botContext: BotContext;
  readonly stateStore: GuildStateStore;
  private _initialized = false;

  constructor(guild: Guild, botContext: BotContext, stateStore?: GuildStateStore) {
    this.guild = guild;
    this.botContext = botContext;
    this.stateStore = stateStore ?? new GuildStateStore();
  }

  /**
   * Initialize all modules for this guild.
   * Call once when the guild is first encountered.
   */
  async init(): Promise<void> {
    if (this._initialized) return;
    this._initialized = true;
    // Modules are singletons with per-guild data - no initialization needed
  }

  // ---- Module Accessors (delegate to static methods) ----

  get nukeDefense(): NukeDefense {
    return NukeDefense.getInstance();
  }

  get auditMonitor(): AuditLogMonitor {
    return AuditLogMonitor.getInstance();
  }

  get ipBanSystem(): IPBanSystem {
    return IPBanSystem.getInstance();
  }

  get rateLimiter(): RateLimiter {
    return RateLimiter.getInstance();
  }

  get sentimentTracker(): SentimentTracker {
    return SentimentTracker.getInstance();
  }

  get joinLimitShield(): JoinLimitShield {
    return JoinLimitShield.getInstance();
  }

  get webhookGuard(): WebhookGuard {
    return WebhookGuard.getInstance();
  }

  get autoHeal(): AutoHeal {
    return AutoHeal.getInstance();
  }

  get quarantine(): Quarantine {
    return Quarantine.getInstance();
  }

  get temporalRaidLock(): TemporalRaidLock {
    return TemporalRaidLock.getInstance();
  }

  get behaviorScoring(): BehaviorScoring {
    return BehaviorScoring.getInstance();
  }

  get sessionHijackDetector(): SessionHijackDetector {
    return SessionHijackDetector.getInstance();
  }

  get oAuthMaliciousAppDetector(): OAuthMaliciousAppDetector {
    return OAuthMaliciousAppDetector.getInstance();
  }

  get autoPermissionRollback(): AutoPermissionRollback {
    return AutoPermissionRollback.getInstance();
  }

  get serverSnapshotRestore(): ServerSnapshotRestore {
    return ServerSnapshotRestore.getInstance();
  }

  get antiVanityHijack(): AntiVanityHijack {
    return AntiVanityHijack.getInstance();
  }

  get emojiStickerProtection(): EmojiStickerProtection {
    return EmojiStickerProtection.getInstance();
  }

  get forumChannelProtection(): ForumChannelProtection {
    return ForumChannelProtection.getInstance();
  }

  get aiRaidPrediction(): AIRaidPrediction {
    return AIRaidPrediction.getInstance();
  }

  get honeypotAdminRole(): HoneypotAdminRole {
    return HoneypotAdminRole.getInstance();
  }

  get antiInviteShield(): AntiInviteShield {
    return AntiInviteShield.getInstance();
  }

  get inviteTracker(): InviteTrackerEngine {
    return InviteTrackerEngine.getInstance();
  }

  /**
   * Clear all modules for this guild (on guild leave).
   */
  destroy(): void {
    // Modules are singletons - clear per-guild data if needed
    this.stateStore.clear(this.guild.id);
    this._initialized = false;
  }
}

// Map to store GuildContext instances by guild ID
const guildContextMap = new Map<string, GuildContext>();

/**
 * Get or create a GuildContext for a guild.
 */
export function getGuildContext(guild: Guild, botContextInstance: typeof botContext): GuildContext {
  let context = guildContextMap.get(guild.id);
  if (!context) {
    context = new GuildContext(guild, botContextInstance);
    guildContextMap.set(guild.id, context);
  }
  return context;
}

/**
 * Destroy and remove a GuildContext for a guild (on guild leave).
 * Clears internal state and removes from global map to prevent memory leaks.
 */
export function destroyGuildContext(guildId: string): void {
  const context = guildContextMap.get(guildId);
  if (context) {
    context.destroy();
    guildContextMap.delete(guildId);
  }
}