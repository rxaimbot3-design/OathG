import { GuildMember } from "discord.js";
import { Quarantine } from "./quarantine.js";
import { BehaviorScoring } from "./behavior-scoring.js";

export interface HoneypotAdminRoleConfig {
  honeypotRoleNames?: string[];
}

export class HoneypotAdminRole {
  private static instance: HoneypotAdminRole;
  private honeypotRoleNames: string[];
  private config: Required<HoneypotAdminRoleConfig>;

  private constructor(config: HoneypotAdminRoleConfig = {}) {
    this.config = {
      honeypotRoleNames: config.honeypotRoleNames ?? ["Owner-Pass", "Free-Admin", "System-Root", "Honeypot-Admin"],
    };
    this.honeypotRoleNames = this.config.honeypotRoleNames;
  }

  static getInstance(config?: HoneypotAdminRoleConfig): HoneypotAdminRole {
    if (!HoneypotAdminRole.instance) {
      HoneypotAdminRole.instance = new HoneypotAdminRole(config);
    }
    return HoneypotAdminRole.instance;
  }

  static resetInstance(): void {
    HoneypotAdminRole.instance = undefined as any;
  }

  async checkRoleChange(member: GuildMember, addedRoleName: string, alertCallback: (msg: string) => void): Promise<boolean> {
    if (this.honeypotRoleNames.some(h => addedRoleName.toLowerCase().includes(h.toLowerCase()))) {
      alertCallback(`[HONEYPOT] User ${member.user.tag} (${member.id}) touched trap role '${addedRoleName}' in ${member.guild.name}! Quarantining immediately.`);
      await Quarantine.getInstance().isolate(member);
      BehaviorScoring.getInstance().addRisk(member.id, 90, "Triggered Honeypot Admin Role Trap");
      return true;
    }
    return false;
  }

  addHoneypotRoleName(name: string): void {
    if (!this.honeypotRoleNames.includes(name)) {
      this.honeypotRoleNames.push(name);
    }
  }

  removeHoneypotRoleName(name: string): void {
    this.honeypotRoleNames = this.honeypotRoleNames.filter(n => n !== name);
  }

  getHoneypotRoleNames(): string[] {
    return [...this.honeypotRoleNames];
  }
}