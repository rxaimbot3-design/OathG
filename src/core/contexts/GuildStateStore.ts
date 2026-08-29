/**
 * GuildStateStore - In-memory TTL-aware key-value store for per-guild state.
 * Replaces scattered Map<string, ...> globals in the bot code.
 */

import type { Guild } from "discord.js";

export interface StoredEntry<T> {
  value: T;
  expiresAt: number;
}

export class GuildStateStore {
  private store = new Map<string, Map<string, StoredEntry<any>>>();
  private defaultTtlMs: number;

  constructor(defaultTtlMs: number = 30 * 60 * 1000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  private getGuildMap(guildId: string): Map<string, StoredEntry<any>> {
    let guildMap = this.store.get(guildId);
    if (!guildMap) {
      guildMap = new Map();
      this.store.set(guildId, guildMap);
    }
    return guildMap;
  }

  set<T>(guildId: string, key: string, value: T, ttlMs?: number): void {
    const guildMap = this.getGuildMap(guildId);
    const ttl = ttlMs ?? this.defaultTtlMs;
    guildMap.set(key, {
      value,
      expiresAt: Date.now() + ttl
    });
  }

  get<T>(guildId: string, key: string): T | undefined {
    const guildMap = this.store.get(guildId);
    if (!guildMap) return undefined;
    const entry = guildMap.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      guildMap.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  has(guildId: string, key: string): boolean {
    const guildMap = this.store.get(guildId);
    if (!guildMap) return false;
    const entry = guildMap.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      guildMap.delete(key);
      return false;
    }
    return true;
  }

  delete(guildId: string, key: string): boolean {
    const guildMap = this.store.get(guildId);
    if (!guildMap) return false;
    return guildMap.delete(key);
  }

  clear(guildId: string): void {
    this.store.delete(guildId);
  }

  /**
   * Remove expired entries for all guilds.
   * Call periodically to prevent memory leaks.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [guildId, guildMap] of this.store) {
      for (const [key, entry] of guildMap) {
        if (now > entry.expiresAt) {
          guildMap.delete(key);
        }
      }
      if (guildMap.size === 0) {
        this.store.delete(guildId);
      }
    }
  }

  /**
   * Get all keys for a guild (for debugging/iteration).
   */
  keys(guildId: string): string[] {
    const guildMap = this.store.get(guildId);
    if (!guildMap) return [];
    return Array.from(guildMap.keys());
  }

  /**
   * Get size of a guild's state (for monitoring).
   */
  size(guildId: string): number {
    const guildMap = this.store.get(guildId);
    return guildMap?.size ?? 0;
  }
}
