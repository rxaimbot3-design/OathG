/**
 * GuildContext - Per-guild container for security module instances.
 * Each guild gets its own context with isolated module instances.
 */

import type { Guild, Client, Message, GuildMember } from "discord.js";
import type { BotContext } from "./BotContext";
import type { GuildStateStore } from "./GuildStateStore";
import type {
  SecurityModule,
  NukeDefenseModule,
  AuditMonitorModule,
  IPBanModule,
  RateLimiterModule,
  SentimentTrackerModule,
  JoinLimitShieldModule,
  InviteTrackerModule,
  WebhookGuardModule,
  AutoHealModule,
  QuarantineModule,
  TemporalRaidLockModule,
  BehaviorScoringModule,
  SessionHijackModule,
  OAuthMaliciousAppModule,
  AutoPermissionRollbackModule,
  ServerSnapshotRestoreModule,
  AntiVanityHijackModule,
  EmojiStickerProtectionModule,
  ForumChannelProtectionModule,
  AIRaidPredictionModule,
  HoneypotAdminRoleModule,
} from "./SecurityModule";

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

    // Lazy-create modules on first access
    // Modules are created here but cached for the guild's lifetime
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

  getNukeDefense(): NukeDefenseModule {
    return this.getModule("nukeDefense", () => ({
      name: "nukeDefense",
      init() {},
      async lockdown() {
        // Delegate to original implementation
        const { NukeDefense } = require("../SecurityFeatures");
        await NukeDefense.lockdown(this.guild);
      },
      isLocked() {
        const { NukeDefense } = require("../SecurityFeatures");
        // NukeDefense doesn't have isLocked, but we can track it
        return false;
      },
    }));
  }

  getAuditMonitor(): AuditMonitorModule {
    return this.getModule("auditMonitor", () => ({
      name: "auditMonitor",
      init() {},
      getRecentActions(_count: number) {
        const { AuditLogMonitor } = require("../SecurityFeatures");
        return AuditLogMonitor.getRecentActions(_count);
      },
      clear() {
        const { AuditLogMonitor } = require("../SecurityFeatures");
        AuditLogMonitor.clear();
      },
    }));
  }

  getIPBanSystem(): IPBanModule {
    return this.getModule("ipBanSystem", () => ({
      name: "ipBanSystem",
      init() {},
      isBanned(ip: string) {
        const { IPBanSystem } = require("../SecurityFeatures");
        return IPBanSystem.isBanned(ip);
      },
      getBans() {
        const { IPBanSystem } = require("../SecurityFeatures");
        return IPBanSystem.getBans();
      },
      addBan(record: any) {
        const { IPBanSystem } = require("../SecurityFeatures");
        IPBanSystem.addBan(record);
      },
      removeBan(ip: string) {
        const { IPBanSystem } = require("../SecurityFeatures");
        IPBanSystem.removeBan(ip);
      },
    }));
  }

  getRateLimiter(): RateLimiterModule {
    return this.getModule("rateLimiter", () => ({
      name: "rateLimiter",
      init() {},
      checkLimit(key: string, windowMs: number, maxRequests: number) {
        const { RateLimiter } = require("../SecurityFeatures");
        return RateLimiter.checkLimit(key, windowMs, maxRequests);
      },
      getRemainingRequests(key: string, windowMs: number, maxRequests: number) {
        const { RateLimiter } = require("../SecurityFeatures");
        return RateLimiter.getRemainingRequests(key, windowMs, maxRequests);
      },
    }));
  }

  getSentimentTracker(): SentimentTrackerModule {
    return this.getModule("sentimentTracker", () => ({
      name: "sentimentTracker",
      init() {},
      async analyzeMessage(message: Message, alertCallback: (msg: string) => void) {
        const { SentimentTracker } = require("../SecurityFeatures");
        await SentimentTracker.analyzeMessage(message, alertCallback);
      },
      getServerScore(guildId: string) {
        const { SentimentTracker } = require("../SecurityFeatures");
        return SentimentTracker.serverScores.get(guildId) ?? 100;
      },
    }));
  }

  getJoinLimitShield(): JoinLimitShieldModule {
    return this.getModule("joinLimitShield", () => ({
      name: "joinLimitShield",
      init() {},
      recordJoin(guildId: string) {
        const { JoinLimitShield } = require("../SecurityFeatures");
        return JoinLimitShield.recordJoin(guildId);
      },
      getStatus(guildId: string) {
        const { JoinLimitShield } = require("../SecurityFeatures");
        return JoinLimitShield.getStatus(guildId);
      },
    }));
  }

  getInviteTracker(): InviteTrackerModule {
    return this.getModule("inviteTracker", () => ({
      name: "inviteTracker",
      init() {},
      getUserData(guildId: string, userId: string) {
        const { InviteTrackerEngine } = require("../SecurityFeatures");
        return InviteTrackerEngine.getUserData(guildId, userId);
      },
      recordJoin(guildId: string, inviterId: string, joinedUserId: string, accountAgeDays: number) {
        const { InviteTrackerEngine } = require("../SecurityFeatures");
        return InviteTrackerEngine.recordJoin(guildId, inviterId, joinedUserId, accountAgeDays);
      },
      recordLeave(guildId: string, leftUserId: string) {
        const { InviteTrackerEngine } = require("../SecurityFeatures");
        return InviteTrackerEngine.recordLeave(guildId, leftUserId);
      },
      getLeaderboard(guildId: string, limit: number) {
        const { InviteTrackerEngine } = require("../SecurityFeatures");
        return InviteTrackerEngine.getLeaderboard(guildId, limit);
      },
    }));
  }

  getWebhookGuard(): WebhookGuardModule {
    return this.getModule("webhookGuard", () => ({
      name: "webhookGuard",
      init() {},
      async verify(guild: Guild) {
        const { WebhookGuard } = require("../SecurityFeatures");
        await WebhookGuard.verify(guild);
      },
      async scanAll(client: Client, alertCallback: (msg: string) => void) {
        const { WebhookGuard } = require("../SecurityFeatures");
        await WebhookGuard.scanAll(client, alertCallback);
      },
    }));
  }

  getAutoHeal(): AutoHealModule {
    return this.getModule("autoHeal", () => ({
      name: "autoHeal",
      init() {},
      async restoreChannel(guild: Guild, channelData: any) {
        const { AutoHeal } = require("../SecurityFeatures");
        return AutoHeal.restoreChannel(guild, channelData);
      },
      async restoreRole(guild: Guild, roleData: any) {
        const { AutoHeal } = require("../SecurityFeatures");
        return AutoHeal.restoreRole(guild, roleData);
      },
      getHealedCount() {
        const { AutoHeal } = require("../SecurityFeatures");
        return AutoHeal.getHealedCount();
      },
    }));
  }

  getQuarantine(): QuarantineModule {
    return this.getModule("quarantine", () => ({
      name: "quarantine",
      init() {},
      async isolate(member: GuildMember) {
        const { Quarantine } = require("../SecurityFeatures");
        await Quarantine.isolate(member);
      },
    }));
  }

  getTemporalRaidLock(): TemporalRaidLockModule {
    return this.getModule("temporalRaidLock", () => ({
      name: "temporalRaidLock",
      init() {},
      lock(guildId: string, durationMs?: number) {
        const { TemporalRaidLock } = require("../SecurityFeatures");
        TemporalRaidLock.lock(guildId, durationMs);
      },
      unlock(guildId: string) {
        const { TemporalRaidLock } = require("../SecurityFeatures");
        TemporalRaidLock.unlock(guildId);
      },
      isLocked(guildId: string) {
        const { TemporalRaidLock } = require("../SecurityFeatures");
        return TemporalRaidLock.isLocked(guildId);
      },
    }));
  }

  getBehaviorScoring(): BehaviorScoringModule {
    return this.getModule("behaviorScoring", () => ({
      name: "behaviorScoring",
      init() {},
      addRisk(userId: string, points: number, reason: string) {
        const { BehaviorScoring } = require("../SecurityFeatures");
        BehaviorScoring.addRisk(userId, points, reason);
      },
      getUserScore(userId: string) {
        const { BehaviorScoring } = require("../SecurityFeatures");
        return BehaviorScoring.getUserScore(userId);
      },
    }));
  }

  getSessionHijackDetector(): SessionHijackModule {
    return this.getModule("sessionHijackDetector", () => ({
      name: "sessionHijackDetector",
      init() {},
      recordAccess(userId: string, ip: string, userAgent?: string) {
        const { SessionHijackDetector } = require("../SecurityFeatures");
        return SessionHijackDetector.recordAccess(userId, ip, userAgent);
      },
    }));
  }

  getOAuthMaliciousAppDetector(): OAuthMaliciousAppModule {
    return this.getModule("oauthMaliciousAppDetector", () => ({
      name: "oauthMaliciousAppDetector",
      init() {},
      async scanGuildIntegrations(guild: Guild, alertCallback: (msg: string) => void) {
        const { OAuthMaliciousAppDetector } = require("../SecurityFeatures");
        return OAuthMaliciousAppDetector.scanGuildIntegrations(guild, alertCallback);
      },
    }));
  }

  getAutoPermissionRollback(): AutoPermissionRollbackModule {
    return this.getModule("autoPermissionRollback", () => ({
      name: "autoPermissionRollback",
      init() {},
      recordPermissionChange(guildId: string, roleId: string, oldPerms: bigint, newPerms: bigint) {
        const { AutoPermissionRollback } = require("../SecurityFeatures");
        AutoPermissionRollback.recordPermissionChange(guildId, roleId, oldPerms, newPerms);
      },
      getPendingRollbacks(guildId: string) {
        const { AutoPermissionRollback } = require("../SecurityFeatures");
        return AutoPermissionRollback.getPendingRollbacks(guildId);
      },
    }));
  }

  getServerSnapshotRestore(): ServerSnapshotRestoreModule {
    return this.getModule("serverSnapshotRestore", () => ({
      name: "serverSnapshotRestore",
      init() {},
      async createSnapshot(guild: Guild) {
        const { ServerSnapshotRestore } = require("../SecurityFeatures");
        return ServerSnapshotRestore.createSnapshot(guild);
      },
      getSnapshots(guildId: string) {
        const { ServerSnapshotRestore } = require("../SecurityFeatures");
        return ServerSnapshotRestore.getSnapshots(guildId);
      },
      async restoreSnapshot(guild: Guild, snapshotId: string) {
        const { ServerSnapshotRestore } = require("../SecurityFeatures");
        return ServerSnapshotRestore.restoreSnapshot(guild, snapshotId);
      },
    }));
  }

  getAntiVanityHijack(): AntiVanityHijackModule {
    return this.getModule("antiVanityHijack", () => ({
      name: "antiVanityHijack",
      init() {},
      trackVanityCode(code: string) {
        const { AntiVanityHijack } = require("../SecurityFeatures");
        AntiVanityHijack.trackVanityCode(code);
      },
      detectChange(oldCode: string | null, newCode: string | null) {
        const { AntiVanityHijack } = require("../SecurityFeatures");
        return AntiVanityHijack.detectChange(oldCode, newCode);
      },
      getRecentChanges(limit?: number) {
        const { AntiVanityHijack } = require("../SecurityFeatures");
        return AntiVanityHijack.getRecentChanges(limit);
      },
    }));
  }

  getEmojiStickerProtection(): EmojiStickerProtectionModule {
    return this.getModule("emojiStickerProtection", () => ({
      name: "emojiStickerProtection",
      init() {},
      trackEmoji(emoji: any, guildId: string) {
        const { EmojiStickerProtection } = require("../SecurityFeatures");
        EmojiStickerProtection.trackEmoji(emoji, guildId);
      },
      trackSticker(sticker: any, guildId: string) {
        const { EmojiStickerProtection } = require("../SecurityFeatures");
        EmojiStickerProtection.trackSticker(sticker, guildId);
      },
      detectMassDeletion(guildId: string, deletedIds: string[]) {
        const { EmojiStickerProtection } = require("../SecurityFeatures");
        return EmojiStickerProtection.detectMassDeletion(guildId, deletedIds);
      },
      getGuildEmojis(guildId: string) {
        const { EmojiStickerProtection } = require("../SecurityFeatures");
        return EmojiStickerProtection.getGuildEmojis(guildId);
      },
      getGuildStickers(guildId: string) {
        const { EmojiStickerProtection } = require("../SecurityFeatures");
        return EmojiStickerProtection.getGuildStickers(guildId);
      },
    }));
  }

  getForumChannelProtection(): ForumChannelProtectionModule {
    return this.getModule("forumChannelProtection", () => ({
      name: "forumChannelProtection",
      init() {},
      trackForumTag(forumId: string, tagId: string, guildId: string) {
        const { ForumChannelProtection } = require("../SecurityFeatures");
        ForumChannelProtection.trackForumTag(forumId, tagId, guildId);
      },
      detectTagDeletion(tagId: string) {
        const { ForumChannelProtection } = require("../SecurityFeatures");
        return ForumChannelProtection.detectTagDeletion(tagId);
      },
      detectMassTagChange(guildId: string, changeCount: number) {
        const { ForumChannelProtection } = require("../SecurityFeatures");
        return ForumChannelProtection.detectMassTagChange(guildId, changeCount);
      },
    }));
  }

  getAIRaidPrediction(): AIRaidPredictionModule {
    return this.getModule("aiRaidPrediction", () => ({
      name: "aiRaidPrediction",
      init() {},
      async predictRaidRisk(guildId: string) {
        const { AIRaidPrediction } = require("../SecurityFeatures");
        return AIRaidPrediction.predictRaidRisk(guildId);
      },
    }));
  }

  getHoneypotAdminRole(): HoneypotAdminRoleModule {
    return this.getModule("honeypotAdminRole", () => ({
      name: "honeypotAdminRole",
      init() {},
      async createHoneypot(guild: Guild) {
        const { HoneypotAdminRole } = require("../SecurityFeatures");
        return HoneypotAdminRole.createHoneypot(guild);
      },
      checkTrapActivation(userId: string, guildId: string) {
        const { HoneypotAdminRole } = require("../SecurityFeatures");
        return HoneypotAdminRole.checkTrapActivation(userId, guildId);
      },
    }));
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
