/**
 * JoinLimitShield - Detects mass join raids by tracking join velocity.
 * Instance-based implementation for use with GuildContext.
 */

import type { SecurityModule } from "../core/interfaces/SecurityModule";
import type { TtlMap } from "../security/MapManager";

export class JoinLimitShieldInstance implements SecurityModule {
  readonly name = "joinLimitShield";
  private joinHistoryByGuild: TtlMap<string, number[]>;
  private raidActiveByGuild: TtlMap<string, boolean>;
  private THRESHOLD = 5; // members
  private WINDOW = 10000; // 10 seconds

  constructor() {
    this.joinHistoryByGuild = new TtlMap<string, number[]>({
      ttlMs: 10000,
      maxEntries: 10000,
      autoCleanupMs: 30000
    });
    this.raidActiveByGuild = new TtlMap<string, boolean>({
      ttlMs: 10000,
      maxEntries: 5000,
      autoCleanupMs: 30000
    });
  }

  init(): void {
    // Nothing to initialize
  }

  recordJoin(guildId: string = "global"): boolean {
    const now = Date.now();
    let history = this.joinHistoryByGuild.get(guildId) || [];
    history.push(now);
    history = history.filter(t => now - t < this.WINDOW);
    this.joinHistoryByGuild.set(guildId, history);

    if (history.length > this.THRESHOLD) {
      const active = this.raidActiveByGuild.get(guildId) || false;
      if (!active) {
        this.raidActiveByGuild.set(guildId, true);
        setTimeout(() => this.raidActiveByGuild.set(guildId, false), this.WINDOW);
        return true;
      }
      return false;
    }
    return false;
  }

  getStatus(guildId: string = "global") {
    const history = this.joinHistoryByGuild.get(guildId) || [];
    return {
      recentJoins: history.length,
      threshold: this.THRESHOLD,
      isHighVelocity: history.length >= this.THRESHOLD - 1
    };
  }

  /**
   * Reset state for a guild (on guild leave).
   */
  reset(guildId: string): void {
    this.joinHistoryByGuild.delete(guildId);
    this.raidActiveByGuild.delete(guildId);
  }
}

/**
 * Global singleton instance (backwards compatibility).
 * @deprecated Use GuildContext.getJoinLimitShield() instead.
 */
export const JoinLimitShield = new JoinLimitShieldInstance();
