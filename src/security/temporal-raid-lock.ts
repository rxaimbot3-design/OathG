/**
 * TemporalRaidLock - Time-based guild lockdown for raid prevention.
 * Instance-based implementation for use with GuildContext.
 */

import type { SecurityModule } from "../core/interfaces/SecurityModule";

export class TemporalRaidLockInstance implements SecurityModule {
  readonly name = "temporalRaidLock";
  private lockedGuilds = new Map<string, { lockedAt: number; durationMs: number }>();
  private joinHistory = new Map<string, number[]>();

  init(): void {
    // Nothing to initialize
  }

  lock(guildId: string, durationMs: number = 600000): void {
    this.lockedGuilds.set(guildId, { lockedAt: Date.now(), durationMs });
    console.log(`[RAID-LOCK] Guild ${guildId} locked for ${durationMs / 1000}s`);
  }

  unlock(guildId: string): void {
    this.lockedGuilds.delete(guildId);
    console.log(`[RAID-LOCK] Guild ${guildId} unlocked`);
  }

  isLocked(guildId: string): boolean {
    const lock = this.lockedGuilds.get(guildId);
    if (!lock) return false;

    if (Date.now() - lock.lockedAt > lock.durationMs) {
      this.lockedGuilds.delete(guildId);
      return false;
    }
    return true;
  }

  recordJoin(guildId: string): void {
    const now = Date.now();
    let history = this.joinHistory.get(guildId) || [];
    history.push(now);
    this.joinHistory.set(guildId, history);
  }

  getJoinCount(guildId: string, windowMs: number = 10000): number {
    const now = Date.now();
    const history = this.joinHistory.get(guildId) || [];
    return history.filter(t => now - t < windowMs).length;
  }

  reset(guildId: string): void {
    this.lockedGuilds.delete(guildId);
    this.joinHistory.delete(guildId);
  }
}

/**
 * Global singleton instance (backwards compatibility).
 * @deprecated Use GuildContext.getTemporalRaidLock() instead.
 */
export const TemporalRaidLock = new TemporalRaidLockInstance();
