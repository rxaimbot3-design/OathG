import { GuildMember, Guild } from "discord.js";
import { withExponentialBackoff } from "../../bot/utils.js";
import { BehaviorScoring } from "./behavior-scoring.js";

export interface QuarantineConfig {
  roleName?: string;
  roleColor?: string;
  retryAttempts?: number;
  retryDelayMs?: number;
}

export class Quarantine {
  private static instance: Quarantine;
  private config: Required<QuarantineConfig>;

  private constructor(config: QuarantineConfig = {}) {
    this.config = {
      roleName: config.roleName ?? "Quarantine-Jail",
      roleColor: config.roleColor ?? "#010101",
      retryAttempts: config.retryAttempts ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000,
    };
  }

  static getInstance(config?: QuarantineConfig): Quarantine {
    if (!Quarantine.instance) {
      Quarantine.instance = new Quarantine(config);
    }
    return Quarantine.instance;
  }

  static resetInstance(): void {
    Quarantine.instance = undefined as any;
  }

  async isolate(member: GuildMember): Promise<boolean> {
    try {
      const guild = member.guild;
      let role = guild.roles.cache.find((r: any) => r.name === this.config.roleName);
      
      if (!role) {
        role = await guild.roles.create({
          name: this.config.roleName,
          color: this.config.roleColor,
          permissions: [],
          reason: "Created for Shadow Banning / Silent Jail System"
        });
        
        for (const [_, channel] of guild.channels.cache) {
          if (channel.isTextBased() && 'permissionOverwrites' in channel) {
            await withExponentialBackoff(() => (channel as any).permissionOverwrites.edit(role, {
              ViewChannel: false,
              SendMessages: false
            }), this.config.retryAttempts, this.config.retryDelayMs).catch((err: any) => {
              console.error(`🚨 CRITICAL: Discord API failure [quarantine channel ${channel.id}]: ${err.message}`);
            });
          }
        }
      }

      const manageableRoles = member.roles.cache.filter((r: any) => r.id !== guild.id && r.editable);
      await withExponentialBackoff(() => member.roles.remove(manageableRoles, "Applying Shadow Ban"), this.config.retryAttempts, this.config.retryDelayMs).catch((err: any) => {
        console.error(`🚨 CRITICAL: Discord API failure [quarantine remove roles]: ${err.message}`);
      });
      await withExponentialBackoff(() => member.roles.add(role, "Ghost Jail Applied"), this.config.retryAttempts, this.config.retryDelayMs).catch((err: any) => {
        console.error(`🚨 CRITICAL: Discord API failure [quarantine add role]: ${err.message}`);
      });
      
      BehaviorScoring.getInstance().addRisk(member.id, 90, "Quarantined / Shadow Banned");
      
      console.log(`☣️ [SILENT JAIL] User ${member.user.tag} has been shadow-banned and isolated.`);
      return true;
    } catch (err: any) {
      console.error(`[QUARANTINE] Error isolating user ${member.user.tag}:`, err);
      return false;
    }
  }

  async release(member: GuildMember): Promise<boolean> {
    try {
      const guild = member.guild;
      const role = guild.roles.cache.find((r: any) => r.name === this.config.roleName);
      if (role) {
        await member.roles.remove(role, "Released from Quarantine").catch(() => {});
      }
      BehaviorScoring.getInstance().reduceRisk(member.id, 50, "Released from Quarantine");
      console.log(`✅ [QUARANTINE] User ${member.user.tag} released from quarantine.`);
      return true;
    } catch (err: any) {
      console.error(`[QUARANTINE] Error releasing user ${member.user.tag}:`, err);
      return false;
    }
  }

  isQuarantined(member: GuildMember): boolean {
    return member.roles.cache.some((r: any) => r.name === this.config.roleName);
  }
}