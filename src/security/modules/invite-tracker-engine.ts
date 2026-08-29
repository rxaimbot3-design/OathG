/**
 * InviteTrackerEngine - Persistent invite tracking with Redis
 * 
 * Features:
 * - Per-guild, per-user invite statistics
 * - Fake account detection (account age < 3 days)
 * - Leave tracking and bonus system
 * - Redis persistence with in-memory fallback
 * - Leaderboards and user stats
 */

import { TtlMap } from "../MapManager.js";
import { RedisPersistence } from "./redis-persistence.js";

export interface UserInviteData {
  regular: number;
  leaves: number;
  fake: number;
  bonus: number;
  invitedUsers: string[]; // Use array for JSON serialization
}

export interface JoinResult {
  regular: boolean;
  fake: boolean;
  total: number;
}

export interface LeaveResult {
  inviterId: string;
  total: number;
}

export interface InviteTrackerEngineConfig {
  ttlMs?: number;
  maxEntries?: number;
  autoCleanupMs?: number;
  keyPrefix?: string;
  fakeAccountThresholdDays?: number;
}

export class InviteTrackerEngine {
  private static instance: InviteTrackerEngine;
  private userInvites: TtlMap<string, Map<string, UserInviteData>>;
  private invitedByMap: TtlMap<string, Map<string, string>>;
  private config: Required<InviteTrackerEngineConfig>;
  private persistence: RedisPersistence;
  private initialized = false;

  private constructor(config: InviteTrackerEngineConfig = {}) {
    this.config = {
      ttlMs: config.ttlMs ?? 30 * 24 * 60 * 60 * 1000,
      maxEntries: config.maxEntries ?? 10000,
      autoCleanupMs: config.autoCleanupMs ?? 600000,
      keyPrefix: config.keyPrefix ?? "invites:",
      fakeAccountThresholdDays: config.fakeAccountThresholdDays ?? 3,
    };
    this.userInvites = new TtlMap<string, Map<string, UserInviteData>>({
      ttlMs: this.config.ttlMs,
      maxEntries: this.config.maxEntries,
      autoCleanupMs: this.config.autoCleanupMs,
    });
    this.invitedByMap = new TtlMap<string, Map<string, string>>({
      ttlMs: this.config.ttlMs,
      maxEntries: this.config.maxEntries,
      autoCleanupMs: this.config.autoCleanupMs,
    });
    this.persistence = RedisPersistence.getInstance();
  }

  static getInstance(config?: InviteTrackerEngineConfig): InviteTrackerEngine {
    if (!InviteTrackerEngine.instance) {
      InviteTrackerEngine.instance = new InviteTrackerEngine(config);
    }
    return InviteTrackerEngine.instance;
  }

  static resetInstance(): void {
    if (InviteTrackerEngine.instance) {
      InviteTrackerEngine.instance.cleanup();
    }
    InviteTrackerEngine.instance = undefined as any;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.persistence.connect();
    await this.loadFromPersistence();
    this.initialized = true;
  }

  private async loadFromPersistence(): Promise<void> {
    try {
      // Load user invites
      const userInviteKeys = await this.persistence.keys(`${this.config.keyPrefix}user:*`);
      for (const key of userInviteKeys) {
        const data = await this.persistence.get<Record<string, UserInviteData>>(key);
        if (data) {
          const guildId = key.replace(`${this.config.keyPrefix}user:`, "");
          const guildMap = new Map<string, UserInviteData>();
          for (const [userId, userData] of Object.entries(data)) {
            // Convert invitedUsers array back to Set-like behavior
            guildMap.set(userId, { ...userData, invitedUsers: userData.invitedUsers ?? [] });
          }
          this.userInvites.set(guildId, guildMap);
        }
      }

      // Load invited-by map
      const invitedByKeys = await this.persistence.keys(`${this.config.keyPrefix}invitedby:*`);
      for (const key of invitedByKeys) {
        const data = await this.persistence.get<Record<string, string>>(key);
        if (data) {
          const guildId = key.replace(`${this.config.keyPrefix}invitedby:`, "");
          const guildMap = new Map<string, string>(Object.entries(data));
          this.invitedByMap.set(guildId, guildMap);
        }
      }

      console.log(`[InviteTracker] Loaded ${this.userInvites.size} guilds from Redis`);
    } catch (err) {
      console.warn("[InviteTracker] Failed to load from persistence:", (err as Error).message);
    }
  }

  private async persistGuildUserInvites(guildId: string): Promise<void> {
    const guildMap = this.userInvites.get(guildId);
    if (!guildMap) return;

    const data: Record<string, UserInviteData> = {};
    for (const [userId, userData] of guildMap.entries()) {
      // Convert Set to array for JSON serialization
      data[userId] = { ...userData, invitedUsers: Array.from(userData.invitedUsers) };
    }
    await this.persistence.set(`${this.config.keyPrefix}user:${guildId}`, data, this.config.ttlMs);
  }

  private async persistGuildInvitedBy(guildId: string): Promise<void> {
    const guildMap = this.invitedByMap.get(guildId);
    if (!guildMap) return;

    const data: Record<string, string> = {};
    for (const [joinedUserId, inviterId] of guildMap.entries()) {
      data[joinedUserId] = inviterId;
    }
    await this.persistence.set(`${this.config.keyPrefix}invitedby:${guildId}`, data, this.config.ttlMs);
  }

  private getUserData(guildId: string, userId: string): UserInviteData {
    if (!this.userInvites.has(guildId)) {
      this.userInvites.set(guildId, new Map());
    }
    const guildMap = this.userInvites.get(guildId)!;
    if (!guildMap.has(userId)) {
      guildMap.set(userId, { regular: 0, leaves: 0, fake: 0, bonus: 0, invitedUsers: [] });
    }
    return guildMap.get(userId)!;
  }

  async recordJoin(guildId: string, inviterId: string, joinedUserId: string, accountAgeDays: number): Promise<JoinResult> {
    if (!this.initialized) await this.initialize();

    const data = this.getUserData(guildId, inviterId);
    data.invitedUsers.push(joinedUserId);

    if (!this.invitedByMap.has(guildId)) {
      this.invitedByMap.set(guildId, new Map());
    }
    this.invitedByMap.get(guildId)!.set(joinedUserId, inviterId);

    let isFake = false;
    if (accountAgeDays < this.config.fakeAccountThresholdDays) {
      data.fake++;
      isFake = true;
    } else {
      data.regular++;
    }

    await this.persistGuildUserInvites(guildId);
    await this.persistGuildInvitedBy(guildId);

    const total = (data.regular + data.bonus) - data.leaves - data.fake;
    return { regular: !isFake, fake: isFake, total: Math.max(0, total) };
  }

  async recordLeave(guildId: string, leftUserId: string): Promise<LeaveResult | null> {
    if (!this.initialized) await this.initialize();

    const guildMap = this.invitedByMap.get(guildId);
    if (!guildMap) return null;
    const inviterId = guildMap.get(leftUserId);
    if (!inviterId) return null;

    const data = this.getUserData(guildId, inviterId);
    data.leaves++;
    const total = (data.regular + data.bonus) - data.leaves - data.fake;

    guildMap.delete(leftUserId);

    await this.persistGuildUserInvites(guildId);
    await this.persistGuildInvitedBy(guildId);

    return { inviterId, total: Math.max(0, total) };
  }

  async addBonus(guildId: string, userId: string, amount: number): Promise<number> {
    if (!this.initialized) await this.initialize();
    const data = this.getUserData(guildId, userId);
    data.bonus += amount;
    await this.persistGuildUserInvites(guildId);
    return (data.regular + data.bonus) - data.leaves - data.fake;
  }

  async resetUser(guildId: string, userId: string): Promise<void> {
    if (!this.initialized) await this.initialize();
    const guildMap = this.userInvites.get(guildId);
    if (guildMap) {
      guildMap.delete(userId);
      await this.persistGuildUserInvites(guildId);
    }
  }

  async resetGuild(guildId: string): Promise<void> {
    if (!this.initialized) await this.initialize();
    this.userInvites.delete(guildId);
    this.invitedByMap.delete(guildId);
    await this.persistence.del(`${this.config.keyPrefix}user:${guildId}`);
    await this.persistence.del(`${this.config.keyPrefix}invitedby:${guildId}`);
  }

  async getLeaderboard(guildId: string, limit: number = 10): Promise<Array<{ userId: string; regular: number; leaves: number; fake: number; bonus: number; total: number }>> {
    if (!this.initialized) await this.initialize();
    const guildMap = this.userInvites.get(guildId);
    if (!guildMap) return [];

    const list: Array<{ userId: string; regular: number; leaves: number; fake: number; bonus: number; total: number }> = [];

    for (const [uId, data] of guildMap.entries()) {
      const total = (data.regular + data.bonus) - data.leaves - data.fake;
      list.push({
        userId: uId,
        regular: data.regular,
        leaves: data.leaves,
        fake: data.fake,
        bonus: data.bonus,
        total
      });
    }

    list.sort((a, b) => b.total - a.total);
    return list.slice(0, limit);
  }

  async getUserStats(guildId: string, userId: string): Promise<UserInviteData | null> {
    if (!this.initialized) await this.initialize();
    const guildMap = this.userInvites.get(guildId);
    if (!guildMap) return null;
    return guildMap.get(userId) ?? null;
  }

  async clear(): Promise<void> {
    this.userInvites.clear();
    this.invitedByMap.clear();
    const keys = await this.persistence.keys(`${this.config.keyPrefix}*`);
    for (const key of keys) {
      await this.persistence.del(key);
    }
  }

  private cleanup(): void {
    this.userInvites.clear();
    this.invitedByMap.clear();
  }

  // Static wrapper methods for backward compatibility
  static async recordJoin(guildId: string, inviterId: string, joinedUserId: string, accountAgeDays: number): Promise<JoinResult> {
    return this.getInstance().recordJoin(guildId, inviterId, joinedUserId, accountAgeDays);
  }

  static async recordLeave(guildId: string, leftUserId: string): Promise<LeaveResult | null> {
    return this.getInstance().recordLeave(guildId, leftUserId);
  }

  static async addBonus(guildId: string, userId: string, amount: number): Promise<number> {
    return this.getInstance().addBonus(guildId, userId, amount);
  }

  static async resetUser(guildId: string, userId: string): Promise<void> {
    return this.getInstance().resetUser(guildId, userId);
  }

  static async resetGuild(guildId: string): Promise<void> {
    return this.getInstance().resetGuild(guildId);
  }

  static async getLeaderboard(guildId: string, limit: number = 10): Promise<Array<{ userId: string; regular: number; leaves: number; fake: number; bonus: number; total: number }>> {
    return this.getInstance().getLeaderboard(guildId, limit);
  }

  static async getUserStats(guildId: string, userId: string): Promise<UserInviteData | null> {
    return this.getInstance().getUserStats(guildId, userId);
  }

  static async clear(): Promise<void> {
    return this.getInstance().clear();
  }
}