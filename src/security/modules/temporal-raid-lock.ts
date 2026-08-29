import { TtlMap } from "../MapManager.js";

export interface TemporalRaidLockConfig {
  maxEntries?: number;
  lockDurationMs?: number;
  joinThreshold?: number;
  windowMs?: number;
}

export interface LockStatus {
  locked: boolean;
  remainingMs: number;
}

export class TemporalRaidLock {
  private static instance: TemporalRaidLock;
  private lockedGuilds: TtlMap<string, { lockedAt: number; durationMs: number }>;
  private joinHistory: TtlMap<string, number[]>;
  private config: Required<TemporalRaidLockConfig>;

  private constructor(config: TemporalRaidLockConfig = {}) {
    this.config = {
      maxEntries: config.maxEntries ?? 5000,
      lockDurationMs: config.lockDurationMs ?? 600000,
      joinThreshold: config.joinThreshold ?? 10,
      windowMs: config.windowMs ?? 10000,
    };
    this.lockedGuilds = new TtlMap<string, { lockedAt: number; durationMs: number }>({
      ttlMs: 600000,
      maxEntries: this.config.maxEntries,
      autoCleanupMs: 60000,
    });
    this.joinHistory = new TtlMap<string, number[]>({
      ttlMs: 600000,
      maxEntries: 10000,
      autoCleanupMs: 30000,
    });
  }

  static getInstance(config?: TemporalRaidLockConfig): TemporalRaidLock {
    if (!TemporalRaidLock.instance) {
      TemporalRaidLock.instance = new TemporalRaidLock(config);
    }
    return TemporalRaidLock.instance;
  }

  static resetInstance(): void {
    TemporalRaidLock.instance = undefined as any;
  }

  lock(guildId: string, durationMs?: number): void {
    this.lockedGuilds.set(guildId, { lockedAt: Date.now(), durationMs: durationMs ?? this.config.lockDurationMs });
    console.log(`[RAID-LOCK] Guild ${guildId} locked for ${(durationMs ?? this.config.lockDurationMs) / 1000}s`);
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

  getStatus(guildId: string): LockStatus {
    const lock = this.lockedGuilds.get(guildId);
    return {
      locked: !!lock,
      remainingMs: lock ? Math.max(0, lock.durationMs - (Date.now() - lock.lockedAt)) : 0,
    };
  }

  recordJoin(guildId: string): boolean {
    const now = Date.now();
    const joins = this.joinHistory.get(guildId) || [];
    joins.push(now);
    this.joinHistory.set(guildId, joins);

    const recent = joins.filter(t => now - t < this.config.windowMs);
    if (recent.length > this.config.joinThreshold) {
      this.lock(guildId, this.config.lockDurationMs);
      return true;
    }
    return false;
  }

  getJoinHistory(guildId: string): number[] {
    return this.joinHistory.get(guildId) || [];
  }

  clear(): void {
    this.lockedGuilds.clear();
    this.joinHistory.clear();
  }
}