/**
 * GuildContext - Per-guild container for security module instances.
 * Each guild gets its own context with isolated module instances.
 */

import type { Guild, Message, GuildMember } from "discord.js";
import type { BotContext } from "./BotContext";
import type { GuildStateStore } from "./GuildStateStore";
import type { SecurityModule } from "./SecurityModule";

// Import security modules
import { NukeDefenseInstance } from "../../security/nuke-defense";
import { AuditLogMonitorInstance } from "../../security/audit-log-monitor";
import { IPBanSystemInstance } from "../../security/ip-ban-system";
import { RateLimiterInstance } from "../../security/rate-limiter";
import { SentimentTrackerInstance } from "../../security/sentiment-tracker";
import { JoinLimitShieldInstance } from "../../security/join-limit-shield";
import { WebhookGuardInstance } from "../../security/webhook-guard";
import { AutoHealInstance } from "../../security/auto-heal";
import { QuarantineInstance } from "../../security/quarantine";
import { TemporalRaidLockInstance } from "../../security/temporal-raid-lock";
import { BehaviorScoringInstance } from "../../security/behavior-scoring";
import { SessionHijackDetectorInstance } from "../../security/session-hijack-detector";
import { OAuthMaliciousAppDetectorInstance } from "../../security/oauth-malicious-app-detector";
import { AutoPermissionRollbackInstance } from "../../security/auto-permission-rollback";
import { ServerSnapshotRestoreInstance } from "../../security/server-snapshot-restore";
import { AntiVanityHijackInstance } from "../../security/anti-vanity-hijack";
import { EmojiStickerProtectionInstance } from "../../security/emoji-sticker-protection";
import { ForumChannelProtectionInstance } from "../../security/forum-channel-protection";
import { AIRaidPredictionInstance } from "../../security/ai-raid-prediction";
import { HoneypotAdminRoleInstance } from "../../security/honeypot-admin-role";

// ============================================================
// GuildContext Implementation
// ============================================================

export class GuildContext {
  readonly guild: Guild;
  readonly botContext: BotContext;
  readonly stateStore: GuildStateStore;

  private modules: Map<string, SecurityModule> = new Map();
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

    // Pre-create core modules
    this.getNukeDefense();
    this.getAuditMonitor();
    this.getRateLimiter();
    this.getSentimentTracker();
    this.getJoinLimitShield();
    this.getWebhookGuard();
    this.getTemporalRaidLock();
    this.getBehaviorScoring();
  }

  /**
   * Get or create a module instance by name.
   */
  private getModule<T extends SecurityModule>(name: string, factory: () => T): T {
    let module = this.modules.get(name) as T | undefined;
    if (!module) {
      module = factory();
      this.modules.set(name, module);
    }
    return module;
  }

  // ---- Module Accessors ----

  getNukeDefense(): NukeDefenseInstance {
    return this.getModule("nukeDefense", () => new NukeDefenseInstance());
  }

  getAuditMonitor(): AuditLogMonitorInstance {
    return this.getModule("auditMonitor", () => new AuditLogMonitorInstance());
  }

  getIPBanSystem(): IPBanSystemInstance {
    return this.getModule("ipBanSystem", () => new IPBanSystemInstance());
  }

  getRateLimiter(): RateLimiterInstance {
    return this.getModule("rateLimiter", () => new RateLimiterInstance());
  }

  getSentimentTracker(): SentimentTrackerInstance {
    return this.getModule("sentimentTracker", () => new SentimentTrackerInstance());
  }

  getJoinLimitShield(): JoinLimitShieldInstance {
    return this.getModule("joinLimitShield", () => new JoinLimitShieldInstance());
  }

  getWebhookGuard(): WebhookGuardInstance {
    return this.getModule("webhookGuard", () => new WebhookGuardInstance());
  }

  getAutoHeal(): AutoHealInstance {
    return this.getModule("autoHeal", () => new AutoHealInstance());
  }

  getQuarantine(): QuarantineInstance {
    return this.getModule("quarantine", () => new QuarantineInstance());
  }

  getTemporalRaidLock(): TemporalRaidLockInstance {
    return this.getModule("temporalRaidLock", () => new TemporalRaidLockInstance());
  }

  getBehaviorScoring(): BehaviorScoringInstance {
    return this.getModule("behaviorScoring", () => new BehaviorScoringInstance());
  }

  getSessionHijackDetector(): SessionHijackDetectorInstance {
    return this.getModule("sessionHijackDetector", () => new SessionHijackDetectorInstance());
  }

  getOAuthMaliciousAppDetector(): OAuthMaliciousAppDetectorInstance {
    return this.getModule("oauthMaliciousAppDetector", () => new OAuthMaliciousAppDetectorInstance());
  }

  getAutoPermissionRollback(): AutoPermissionRollbackInstance {
    return this.getModule("autoPermissionRollback", () => new AutoPermissionRollbackInstance());
  }

  getServerSnapshotRestore(): ServerSnapshotRestoreInstance {
    return this.getModule("serverSnapshotRestore", () => new ServerSnapshotRestoreInstance());
  }

  getAntiVanityHijack(): AntiVanityHijackInstance {
    return this.getModule("antiVanityHijack", () => new AntiVanityHijackInstance());
  }

  getEmojiStickerProtection(): EmojiStickerProtectionInstance {
    return this.getModule("emojiStickerProtection", () => new EmojiStickerProtectionInstance());
  }

  getForumChannelProtection(): ForumChannelProtectionInstance {
    return this.getModule("forumChannelProtection", () => new ForumChannelProtectionInstance());
  }

  getAIRaidPrediction(): AIRaidPredictionInstance {
    return this.getModule("aiRaidPrediction", () => new AIRaidPredictionInstance());
  }

  getHoneypotAdminRole(): HoneypotAdminRoleInstance {
    return this.getModule("honeypotAdminRole", () => new HoneypotAdminRoleInstance());
  }

  /**
   * Get all initialized modules for this guild.
   */
  getInitializedModules(): SecurityModule[] {
    return Array.from(this.modules.values());
  }

  /**
   * Clear all modules for this guild (on guild leave).
   */
  destroy(): void {
    for (const module of this.modules.values()) {
      module.destroy?.();
    }
    this.modules.clear();
    this.stateStore.clear(this.guild.id);
    this._initialized = false;
  }
}
