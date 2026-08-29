import { Guild, ChannelType } from "discord.js";

export interface NukeDefenseConfig {
  dryRun?: boolean;
  lockChannels?: boolean;
  revokeInvites?: boolean;
  alertCallback?: (msg: string) => void;
}

export interface LockdownResult {
  success: boolean;
  channelsLocked: number;
  invitesRevoked: number;
  errors: string[];
  dryRun: boolean;
}

export class NukeDefense {
  private static instance: NukeDefense;
  private config: Required<NukeDefenseConfig>;

  private constructor(config: NukeDefenseConfig = {}) {
    this.config = {
      dryRun: config.dryRun ?? false,
      lockChannels: config.lockChannels ?? true,
      revokeInvites: config.revokeInvites ?? true,
      alertCallback: config.alertCallback ?? (() => {}),
    };
  }

  static getInstance(config?: NukeDefenseConfig): NukeDefense {
    if (!NukeDefense.instance) {
      NukeDefense.instance = new NukeDefense(config);
    }
    return NukeDefense.instance;
  }

  static resetInstance(): void {
    NukeDefense.instance = undefined as any;
  }

  setConfig(config: Partial<NukeDefenseConfig>): void {
    this.config = { ...this.config, ...config };
  }

  private isTextChannel(channel: any): channel is { permissionOverwrites: { edit: (role: any, perms: any) => Promise<any> }; name: string } {
    return channel && 
      (channel.type === ChannelType.GuildText || channel.type === 0) && 
      typeof channel.permissionOverwrites?.edit === "function";
  }

  async lockdown(guild: Guild): Promise<LockdownResult> {
    const errors: string[] = [];
    let channelsLocked = 0;
    let invitesRevoked = 0;

    this.config.alertCallback(`🚨 INITIATING 1-CLICK PANIC LOCKDOWN FOR ${guild.name} ${this.config.dryRun ? "(DRY RUN)" : ""} 🚨`);

    // Revoke all invite links
    if (this.config.revokeInvites) {
      try {
        const invites = await guild.invites.fetch().catch(() => null);
        if (invites) {
          for (const [_, invite] of invites) {
            if (!this.config.dryRun) {
              await invite.delete("1-Click Nuke Defense Lockdown").catch(() => {});
            }
            invitesRevoked++;
          }
        }
      } catch (err: any) {
        errors.push(`Failed to revoke invites: ${err.message}`);
      }
    }

    // Lock all channels
    if (this.config.lockChannels) {
      for (const [_, channel] of guild.channels.cache) {
        if (this.isTextChannel(channel)) {
          try {
            if (!this.config.dryRun) {
              await channel.permissionOverwrites.edit(guild.roles.everyone, {
                SendMessages: false,
                AddReactions: false,
              });
            }
            channelsLocked++;
          } catch (err: any) {
            errors.push(`Failed to lock channel ${channel.name}: ${err.message}`);
          }
        }
      }
    }

    const success = errors.length === 0;
    this.config.alertCallback(
      success 
        ? `✅ LOCKDOWN ${this.config.dryRun ? "SIMULATION " : ""}SECURED. ${channelsLocked} channels locked, ${invitesRevoked} invites revoked.`
        : `⚠️ LOCKDOWN ${this.config.dryRun ? "SIMULATION " : ""}COMPLETED WITH ERRORS: ${errors.join(", ")}`
    );

    return { success, channelsLocked, invitesRevoked, errors, dryRun: this.config.dryRun };
  }

  isDryRun(): boolean {
    return this.config.dryRun;
  }
}