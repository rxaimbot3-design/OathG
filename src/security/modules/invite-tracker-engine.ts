import { TtlMap } from "../MapManager.js";

export interface UserInviteData {
  regular: number;
  leaves: number;
  fake: number;
  bonus: number;
  invitedUsers: Set<string>;
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
}

export class InviteTrackerEngine {
  private static instance: InviteTrackerEngine;
  private userInvites: TtlMap<string, Map<string, UserInviteData>>;
  private invitedByMap: TtlMap<string, Map<string, string>>;
  private config: Required<InviteTrackerEngineConfig>;

  private constructor(config: InviteTrackerEngineConfig = {}) {
    this.config = {
      ttlMs: config.ttlMs ?? 30 * 24 * 60 * 60 * 1000,
      maxEntries: config.maxEntries ?? 1000,
      autoCleanupMs: config.autoCleanupMs ?? 600000,
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
  }

  static getInstance(config?: InviteTrackerEngineConfig): InviteTrackerEngine {
    if (!InviteTrackerEngine.instance) {
      InviteTrackerEngine.instance = new InviteTrackerEngine(config);
    }
    return InviteTrackerEngine.instance;
  }

  static resetInstance(): void {
    InviteTrackerEngine.instance = undefined as any;
  }

  private getUserData(guildId: string, userId: string): UserInviteData {
    if (!this.userInvites.has(guildId)) {
      this.userInvites.set(guildId, new Map());
    }
    const guildMap = this.userInvites.get(guildId)!;
    if (!guildMap.has(userId)) {
      guildMap.set(userId, { regular: 0, leaves: 0, fake: 0, bonus: 0, invitedUsers: new Set() });
    }
    return guildMap.get(userId)!;
  }

  recordJoin(guildId: string, inviterId: string, joinedUserId: string, accountAgeDays: number): JoinResult {
    const data = this.getUserData(guildId, inviterId);
    data.invitedUsers.add(joinedUserId);

    if (!this.invitedByMap.has(guildId)) {
      this.invitedByMap.set(guildId, new Map());
    }
    this.invitedByMap.get(guildId)!.set(joinedUserId, inviterId);

    let isFake = false;
    if (accountAgeDays < 3) {
      data.fake++;
      isFake = true;
    } else {
      data.regular++;
    }

    const total = (data.regular + data.bonus) - data.leaves - data.fake;
    return { regular: !isFake, fake: isFake, total: Math.max(0, total) };
  }

  recordLeave(guildId: string, leftUserId: string): LeaveResult | null {
    const guildMap = this.invitedByMap.get(guildId);
    if (!guildMap) return null;
    const inviterId = guildMap.get(leftUserId);
    if (!inviterId) return null;

    const data = this.getUserData(guildId, inviterId);
    data.leaves++;
    const total = (data.regular + data.bonus) - data.leaves - data.fake;
    
    guildMap.delete(leftUserId);
    
    return { inviterId, total: Math.max(0, total) };
  }

  addBonus(guildId: string, userId: string, amount: number): number {
    const data = this.getUserData(guildId, userId);
    data.bonus += amount;
    return (data.regular + data.bonus) - data.leaves - data.fake;
  }

  resetUser(guildId: string, userId: string): void {
    const guildMap = this.userInvites.get(guildId);
    if (guildMap) {
      guildMap.delete(userId);
    }
  }

  resetGuild(guildId: string): void {
    this.userInvites.delete(guildId);
    this.invitedByMap.delete(guildId);
  }

  getLeaderboard(guildId: string, limit: number = 10): Array<{ userId: string; regular: number; leaves: number; fake: number; bonus: number; total: number }> {
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

  getUserStats(guildId: string, userId: string): UserInviteData | null {
    const guildMap = this.userInvites.get(guildId);
    if (!guildMap) return null;
    return guildMap.get(userId) ?? null;
  }

  clear(): void {
    this.userInvites.clear();
    this.invitedByMap.clear();
  }

  // Static wrapper methods for backward compatibility
  static recordJoin(guildId: string, inviterId: string, joinedUserId: string, accountAgeDays: number): JoinResult {
    return this.getInstance().recordJoin(guildId, inviterId, joinedUserId, accountAgeDays);
  }

  static recordLeave(guildId: string, leftUserId: string): LeaveResult | null {
    return this.getInstance().recordLeave(guildId, leftUserId);
  }

  static addBonus(guildId: string, userId: string, amount: number): number {
    return this.getInstance().addBonus(guildId, userId, amount);
  }

  static resetUser(guildId: string, userId: string): void {
    return this.getInstance().resetUser(guildId, userId);
  }

  static resetGuild(guildId: string): void {
    return this.getInstance().resetGuild(guildId);
  }

  static getLeaderboard(guildId: string, limit: number = 10): Array<{ userId: string; regular: number; leaves: number; fake: number; bonus: number; total: number }> {
    return this.getInstance().getLeaderboard(guildId, limit);
  }

  static getUserStats(guildId: string, userId: string): UserInviteData | null {
    return this.getInstance().getUserStats(guildId, userId);
  }

  static clear(): void {
    return this.getInstance().clear();
  }
}