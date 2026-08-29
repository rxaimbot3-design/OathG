import { Guild, ChannelType } from "discord.js";
import { TtlMap } from "../MapManager.js";

export interface AutoHealConfig {
  maxEntries?: number;
  ttlMs?: number;
  autoCleanupMs?: number;
}

export interface ChannelData {
  name: string;
  type: number;
  parentId?: string | null;
  topic?: string | null;
}

export interface RoleData {
  name: string;
  color: number;
  permissions: string;
  hoist?: boolean;
}

export class AutoHeal {
  private static instance: AutoHeal;
  private healedChannels: TtlMap<string, number>;
  private config: Required<AutoHealConfig>;

  private constructor(config: AutoHealConfig = {}) {
    this.config = {
      maxEntries: config.maxEntries ?? 10000,
      ttlMs: config.ttlMs ?? 24 * 60 * 60 * 1000,
      autoCleanupMs: config.autoCleanupMs ?? 300000,
    };
    this.healedChannels = new TtlMap<string, number>({
      ttlMs: this.config.ttlMs,
      maxEntries: this.config.maxEntries,
      autoCleanupMs: this.config.autoCleanupMs,
    });
  }

  static getInstance(config?: AutoHealConfig): AutoHeal {
    if (!AutoHeal.instance) {
      AutoHeal.instance = new AutoHeal(config);
    }
    return AutoHeal.instance;
  }

  static resetInstance(): void {
    AutoHeal.instance = undefined as any;
  }

  async restoreChannel(guild: Guild, channelData: ChannelData): Promise<any | null> {
    const existing = guild.channels.cache.find(c => c.name.toLowerCase() === channelData.name.toLowerCase());
    if (existing) {
      console.log(`[AUTO-HEAL] Channel ${channelData.name} already exists, skipping.`);
      return existing;
    }

    try {
      const created = await guild.channels.create({
        name: channelData.name,
        type: channelData.type,
        parent: channelData.parentId,
        topic: channelData.topic || undefined,
        reason: "Auto-Heal: Restoring deleted channel"
      }) as any;

      this.healedChannels.set(created.id, Date.now());
      console.log(`[AUTO-HEAL] Restored channel ${channelData.name}`);
      return created;
    } catch (err: any) {
      console.error(`[AUTO-HEAL] Failed to restore channel ${channelData.name}:`, err.message);
      return null;
    }
  }

  async restoreRole(guild: Guild, roleData: RoleData): Promise<any | null> {
    const existing = guild.roles.cache.find(r => r.name.toLowerCase() === roleData.name.toLowerCase());
    if (existing) {
      console.log(`[AUTO-HEAL] Role ${roleData.name} already exists, skipping.`);
      return existing;
    }

    try {
      const created = await guild.roles.create({
        name: roleData.name,
        color: roleData.color,
        permissions: BigInt(roleData.permissions || "0"),
        hoist: roleData.hoist || false,
        reason: "Auto-Heal: Restoring deleted role"
      });

      console.log(`[AUTO-HEAL] Restored role ${roleData.name}`);
      return created;
    } catch (err: any) {
      console.error(`[AUTO-HEAL] Failed to restore role ${roleData.name}:`, err.message);
      return null;
    }
  }

  getHealedCount(): number {
    return this.healedChannels.size;
  }

  getHealedChannels(): string[] {
    return Array.from(this.healedChannels.keys());
  }

  clear(): void {
    this.healedChannels.clear();
  }

  // Static wrapper methods for backward compatibility
  static async restoreChannel(guild: Guild, channelData: ChannelData): Promise<any | null> {
    return this.getInstance().restoreChannel(guild, channelData);
  }

  static async restoreRole(guild: Guild, roleData: RoleData): Promise<any | null> {
    return this.getInstance().restoreRole(guild, roleData);
  }

  static getHealedCount(): number {
    return this.getInstance().getHealedCount();
  }

  static getHealedChannels(): string[] {
    return this.getInstance().getHealedChannels();
  }

  static clear(): void {
    return this.getInstance().clear();
  }
}