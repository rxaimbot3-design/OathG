/**
 * AutoHeal - Automatic restoration of deleted channels and roles.
 * Instance-based implementation for use with GuildContext.
 */

import type { SecurityModule } from "../core/interfaces/SecurityModule";
import type { Guild } from "discord.js";

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

export class AutoHealInstance implements SecurityModule {
  readonly name = "autoHeal";
  private healedChannels = new Map<string, number>();

  init(): void {
    // Nothing to initialize
  }

  async restoreChannel(guild: Guild, channelData: ChannelData) {
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
    } catch (err) {
      console.error(`[AUTO-HEAL] Failed to restore channel ${channelData.name}:`, err);
      return null;
    }
  }

  async restoreRole(guild: Guild, roleData: RoleData) {
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
    } catch (err) {
      console.error(`[AUTO-HEAL] Failed to restore role ${roleData.name}:`, err);
      return null;
    }
  }

  getHealedCount(): number {
    return this.healedChannels.size;
  }
}

/**
 * Global singleton instance (backwards compatibility).
 * @deprecated Use GuildContext.getAutoHeal() instead.
 */
export const AutoHeal = new AutoHealInstance();
