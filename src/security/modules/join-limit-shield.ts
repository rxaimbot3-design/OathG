import { TtlMap } from "../MapManager.js";

export interface JoinLimitShieldConfig {
  threshold?: number;
  windowMs?: number;
  maxEntries?: number;
  ttlMs?: number;
}

export interface JoinStatus {
  recentJoins: number;
  threshold: number;
  isHighVelocity: boolean;
}

export class JoinLimitShield {
  private static instance: JoinLimitShield;
  private joinHistoryByGuild: TtlMap<string, number[]>;
  private raidActiveByGuild: TtlMap<string, boolean>;
  private config: Required<JoinLimitShieldConfig>;

  private constructor(config: JoinLimitShieldConfig = {}) {
    this.config = {
      threshold: config.threshold ?? 5,
      windowMs: config.windowMs ?? 10000,
      maxEntries: config.maxEntries ?? 10000,
      ttlMs: config.ttlMs ?? 10000,
    };
    this.joinHistoryByGuild = new TtlMap<string, number[]>({
      ttlMs: this.config.ttlMs,
      maxEntries: this.config.maxEntries,
      autoCleanupMs: 30000,
    });
    this.raidActiveByGuild = new TtlMap<string, boolean>({
      ttlMs: this.config.ttlMs,
      maxEntries: 5000,
      autoCleanupMs: 30000,
    });
  }

  static getInstance(config?: JoinLimitShieldConfig): JoinLimitShield {
    if (!JoinLimitShield.instance) {
      JoinLimitShield.instance = new JoinLimitShield(config);
    }
    return JoinLimitShield.instance;
  }

  static resetInstance(): void {
    JoinLimitShield.instance = undefined as any;
  }

  recordJoin(guildId: string = "global"): boolean {
    const now = Date.now();
    let history = this.joinHistoryByGuild.get(guildId) || [];
    history.push(now);
    history = history.filter(t => now - t < this.config.windowMs);
    this.joinHistoryByGuild.set(guildId, history);

    if (history.length > this.config.threshold) {
      const active = this.raidActiveByGuild.get(guildId) || false;
      if (!active) {
        this.raidActiveByGuild.set(guildId, true);
        setTimeout(() => this.raidActiveByGuild.set(guildId, false), this.config.windowMs);
        return true;
      }
      return false;
    }
    return false;
  }

  getStatus(guildId: string = "global"): JoinStatus {
    const history = this.joinHistoryByGuild.get(guildId) || [];
    return {
      recentJoins: history.length,
      threshold: this.config.threshold,
      isHighVelocity: history.length >= this.config.threshold - 1
    };
  }

  isRaidActive(guildId: string = "global"): boolean {
    return this.raidActiveByGuild.get(guildId) ?? false;
  }

  clear(): void {
    this.joinHistoryByGuild.clear();
    this.raidActiveByGuild.clear();
  }

  // Static wrapper methods for backward compatibility
  static recordJoin(guildId: string = "global"): boolean {
    return this.getInstance().recordJoin(guildId);
  }

  static getStatus(guildId: string = "global"): JoinStatus {
    return this.getInstance().getStatus(guildId);
  }

  static isRaidActive(guildId: string = "global"): boolean {
    return this.getInstance().isRaidActive(guildId);
  }

  static clear(): void {
    return this.getInstance().clear();
  }
}