/**
 * Quarantine - Shadow-ban system that isolates users.
 * Instance-based implementation for use with GuildContext.
 */

import type { SecurityModule } from "../core/interfaces/SecurityModule";
import type { GuildMember } from "discord.js";

export class QuarantineInstance implements SecurityModule {
  readonly name = "quarantine";
  private quarantinedUsers = new Set<string>();

  init(): void {
    // Nothing to initialize
  }

  async isolate(member: GuildMember): Promise<void> {
    if (this.quarantinedUsers.has(member.id)) return;

    try {
      const guild = member.guild;
      let role = guild.roles.cache.find((r: any) => r.name === "Quarantine-Jail");

      if (!role) {
        role = await guild.roles.create({
          name: "Quarantine-Jail",
          color: "#010101",
          permissions: [],
          reason: "Created for Shadow Banning / Silent Jail System"
        });

        for (const [_, channel] of guild.channels.cache) {
          if (channel.isTextBased() && 'permissionOverwrites' in channel) {
            await (channel as any).permissionOverwrites.edit(role, {
              ViewChannel: false,
              SendMessages: false
            }).catch((err: any) => {
              console.error(`🚨 CRITICAL: Discord API failure [quarantine channel ${channel.id}]: ${err.message}`);
            });
          }
        }
      }

      const manageableRoles = member.roles.cache.filter((r: any) => r.id !== guild.id && r.editable);
      await member.roles.remove(manageableRoles, "Applying Shadow Ban").catch((err: any) => {
        console.error(`🚨 CRITICAL: Discord API failure [quarantine remove roles]: ${err.message}`);
      });

      await member.roles.add(role, "Ghost Jail Applied").catch((err: any) => {
        console.error(`🚨 CRITICAL: Discord API failure [quarantine add role]: ${err.message}`);
      });

      this.quarantinedUsers.add(member.id);
      console.log(`☣️ [SILENT JAIL] User ${member.user.tag} has been shadow-banned and isolated.`);
    } catch (err) {
      console.error(`[QUARANTINE] Error isolating user ${member.user.tag}:`, err);
    }
  }

  isQuarantined(userId: string): boolean {
    return this.quarantinedUsers.has(userId);
  }

  release(userId: string): void {
    this.quarantinedUsers.delete(userId);
  }
}

/**
 * Global singleton instance (backwards compatibility).
 * @deprecated Use GuildContext.getQuarantine() instead.
 */
export const Quarantine = new QuarantineInstance();
