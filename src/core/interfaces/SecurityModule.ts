/**
 * Core interfaces and base classes for the security and bot modules.
 */

import type { Client, Guild, Message, GuildMember, TextChannel, User } from "discord.js";

// ============================================================
// Security Module Interface
// ============================================================

export interface SecurityModule {
  readonly name: string;
  init(): void | Promise<void>;
  destroy?(): void | Promise<void>;
}

// ============================================================
// Guild State Store Interface
// ============================================================

export interface GuildStateStore {
  getGuildData<T>(guildId: string, key: string): T | undefined;
  setGuildData<T>(guildId: string, key: string, value: T): void;
  deleteGuildData(guildId: string, key: string): void;
  clearGuildData(guildId: string): void;
}

// ============================================================
// Bot Context (Global Singleton Container)
// ============================================================

export interface BotContext {
  readonly client: Client | null;
  readonly geminiApiKey: string | undefined;
  readonly adminSecret: string | undefined;
  readonly ownerIds: Set<string>;
  readonly isPanicLockdownActive: boolean;
  readonly startTime: number;

  setClient(client: Client): void;
  setPanicLockdown(active: boolean): void;
  isOwner(userId: string, guildOwnerId?: string): boolean;
}

export class DefaultBotContext implements BotContext {
  private _client: Client | null = null;
  private _panicLockdown = false;
  private _ownerIds = new Set<string>();
  private _startTime = Date.now();

  get client(): Client | null { return this._client; }
  get geminiApiKey(): string | undefined { return process.env.GEMINI_API_KEY; }
  get adminSecret(): string | undefined { return process.env.ADMIN_SECRET; }
  get ownerIds(): Set<string> { return this._ownerIds; }
  get isPanicLockdownActive(): boolean { return this._panicLockdown; }
  get startTime(): number { return this._startTime; }

  setClient(client: Client): void {
    this._client = client;
  }

  setPanicLockdown(active: boolean): void {
    this._panicLockdown = active;
  }

  isOwner(userId: string, guildOwnerId?: string): boolean {
    if (!userId) return false;
    if (guildOwnerId && userId === guildOwnerId) return true;
    return this._ownerIds.has(userId);
  }

  registerOwner(userId: string): void {
    if (userId) this._ownerIds.add(userId);
  }

  unregisterOwner(userId: string): void {
    this._ownerIds.delete(userId);
  }
}

// ============================================================
// Guild Context (Per-Guild Instance Container)
// ============================================================

export interface GuildContext {
  readonly guild: Guild;
  readonly botContext: BotContext;
  readonly stateStore: GuildStateStore;

  getNukeDefense(): NukeDefenseModule;
  getAuditMonitor(): AuditMonitorModule;
  getIPBanSystem(): IPBanModule;
  getRateLimiter(): RateLimiterModule;
  getSentimentTracker(): SentimentTrackerModule;
  getJoinLimitShield(): JoinLimitShieldModule;
  getInviteTracker(): InviteTrackerModule;
  getWebhookGuard(): WebhookGuardModule;
  getAutoHeal(): AutoHealModule;
  getQuarantine(): QuarantineModule;
  getTemporalRaidLock(): TemporalRaidLockModule;
  getBehaviorScoring(): BehaviorScoringModule;
  getSessionHijackDetector(): SessionHijackModule;
  getOAuthMaliciousAppDetector(): OAuthMaliciousAppModule;
  getAutoPermissionRollback(): AutoPermissionRollbackModule;
  getServerSnapshotRestore(): ServerSnapshotRestoreModule;
  getAntiVanityHijack(): AntiVanityHijackModule;
  getEmojiStickerProtection(): EmojiStickerProtectionModule;
  getForumChannelProtection(): ForumChannelProtectionModule;
  getAIRaidPrediction(): AIRaidPredictionModule;
  getHoneypotAdminRole(): HoneypotAdminRoleModule;
}

// ============================================================
// Module Interfaces (for type safety)
// ============================================================

export interface NukeDefenseModule extends SecurityModule {
  lockdown(): Promise<void>;
  isLocked(): boolean;
}

export interface AuditMonitorModule extends SecurityModule {
  getRecentActions(count: number): Array<any>;
  clear(): void;
}

export interface IPBanModule extends SecurityModule {
  isBanned(ip: string): boolean;
  getBans(): Array<any>;
  addBan(record: any): void;
  removeBan(ip: string): void;
}

export interface RateLimiterModule extends SecurityModule {
  checkLimit(key: string, windowMs: number, maxRequests: number): boolean;
  getRemainingRequests(key: string, windowMs: number, maxRequests: number): number;
}

export interface SentimentTrackerModule extends SecurityModule {
  analyzeMessage(message: Message, alertCallback: (msg: string) => void): Promise<void>;
  getServerScore(guildId: string): number;
}

export interface JoinLimitShieldModule extends SecurityModule {
  recordJoin(guildId: string): boolean;
  getStatus(guildId: string): { recentJoins: number; threshold: number; isHighVelocity: boolean };
}

export interface InviteTrackerModule extends SecurityModule {
  getUserData(guildId: string, userId: string): any;
  recordJoin(guildId: string, inviterId: string, joinedUserId: string, accountAgeDays: number): any;
  recordLeave(guildId: string, leftUserId: string): any | null;
  getLeaderboard(guildId: string, limit: number): Array<any>;
}

export interface WebhookGuardModule extends SecurityModule {
  verify(guild: Guild): Promise<void>;
  scanAll(client: Client, alertCallback: (msg: string) => void): Promise<void>;
}

export interface AutoHealModule extends SecurityModule {
  restoreChannel(guild: Guild, channelData: any): Promise<any>;
  restoreRole(guild: Guild, roleData: any): Promise<any>;
  getHealedCount(): number;
}

export interface QuarantineModule extends SecurityModule {
  isolate(member: GuildMember): Promise<void>;
}

export interface TemporalRaidLockModule extends SecurityModule {
  lock(guildId: string, durationMs?: number): void;
  unlock(guildId: string): void;
  isLocked(guildId: string): boolean;
}

export interface BehaviorScoringModule extends SecurityModule {
  addRisk(userId: string, points: number, reason: string): void;
  getUserScore(userId: string): number;
}

export interface SessionHijackModule extends SecurityModule {
  recordAccess(userId: string, ip: string, userAgent?: string): boolean;
}

export interface OAuthMaliciousAppModule extends SecurityModule {
  scanGuildIntegrations(guild: Guild, alertCallback: (msg: string) => void): Promise<{ scanned: number; threatsFound: number }>;
}

export interface AutoPermissionRollbackModule extends SecurityModule {
  recordPermissionChange(guildId: string, roleId: string, oldPerms: bigint, newPerms: bigint): void;
  getPendingRollbacks(guildId: string): Array<any>;
}

export interface ServerSnapshotRestoreModule extends SecurityModule {
  createSnapshot(guild: Guild): Promise<any>;
  getSnapshots(guildId: string): Array<any>;
  restoreSnapshot(guild: Guild, snapshotId: string): Promise<boolean>;
}

export interface AntiVanityHijackModule extends SecurityModule {
  trackVanityCode(code: string): void;
  detectChange(oldCode: string | null, newCode: string | null): boolean;
  getRecentChanges(limit?: number): Array<any>;
}

export interface EmojiStickerProtectionModule extends SecurityModule {
  trackEmoji(emoji: any, guildId: string): void;
  trackSticker(sticker: any, guildId: string): void;
  detectMassDeletion(guildId: string, deletedIds: string[]): boolean;
  getGuildEmojis(guildId: string): Array<any>;
  getGuildStickers(guildId: string): Array<any>;
}

export interface ForumChannelProtectionModule extends SecurityModule {
  trackForumTag(forumId: string, tagId: string, guildId: string): void;
  detectTagDeletion(tagId: string): boolean;
  detectMassTagChange(guildId: string, changeCount: number): boolean;
}

export interface AIRaidPredictionModule extends SecurityModule {
  predictRaidRisk(guildId: string): Promise<{ risk: number; factors: string[] }>;
}

export interface HoneypotAdminRoleModule extends SecurityModule {
  createHoneypot(guild: Guild): Promise<any>;
  checkTrapActivation(userId: string, guildId: string): boolean;
}
