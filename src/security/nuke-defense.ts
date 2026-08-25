/**
 * NukeDefense - Panic lockdown and nuke protection.
 * Instance-based implementation for use with GuildContext.
 */

import type { SecurityModule } from "../core/interfaces/SecurityModule";
import type { Guild } from "discord.js";

export class NukeDefenseInstance implements SecurityModule {
  readonly name = "nukeDefense";
  private _lockedGuilds = new Set<string>();

  init(): void {
    // Nothing to initialize
  }

  async lockdown(guild: Guild): Promise<void> {
    if (this._lockedGuilds.has(guild.id)) return;
    this._lockedGuilds.add(guild.id);

    try {
      // Revoke all invite links
      const invites = await guild.invites.fetch();
      for (const [_, invite] of invites) {
        await invite.delete("1-Click Nuke Defense Lockdown").catch(() => {});
      }

      // Lock all channels
      for (const [_, channel] of guild.channels.cache) {
        if (channel.type === 0) { // TextChannel
          await (channel as any).permissionOverwrites.edit(guild.roles.everyone, {
            SendMessages: false,
            AddReactions: false
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error(`[NUKE-DEFENSE] Lockdown failed for ${guild.name}:`, err);
    }
  }

  isLocked(guildId: string): boolean {
    return this._lockedGuilds.has(guildId);
  }

  unlock(guildId: string): void {
    this._lockedGuilds.delete(guildId);
  }
}

/**
 * Global singleton instance (backwards compatibility).
 * @deprecated Use GuildContext.getNukeDefense() instead.
 */
export const NukeDefense = new NukeDefenseInstance();
