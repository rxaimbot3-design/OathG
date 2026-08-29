import { Message } from "discord.js";

export interface IPWhitelistConfig {
  whitelistedIPs?: string[];
}

export class IPWhitelist {
  private static instance: IPWhitelist;
  private whitelistedIPs: string[];

  private constructor(config: IPWhitelistConfig = {}) {
    this.whitelistedIPs = config.whitelistedIPs ?? ["127.0.0.1", "::1"];
  }

  static getInstance(config?: IPWhitelistConfig): IPWhitelist {
    if (!IPWhitelist.instance) {
      IPWhitelist.instance = new IPWhitelist(config);
    }
    return IPWhitelist.instance;
  }

  static resetInstance(): void {
    IPWhitelist.instance = undefined as any;
  }

  checkIP(ip: string): boolean {
    return this.whitelistedIPs.includes(ip);
  }

  addIP(ip: string): void {
    if (!this.whitelistedIPs.includes(ip)) {
      this.whitelistedIPs.push(ip);
    }
  }

  removeIP(ip: string): void {
    this.whitelistedIPs = this.whitelistedIPs.filter(i => i !== ip);
  }

  getIPs(): string[] {
    return [...this.whitelistedIPs];
  }
}

export interface DMFirewallConfig {
  enabled?: boolean;
  replyMessage?: string;
}

export class DMFirewall {
  private static instance: DMFirewall;
  private enabled: boolean;
  private replyMessage: string;

  private constructor(config: DMFirewallConfig = {}) {
    this.enabled = config.enabled ?? true;
    this.replyMessage = config.replyMessage ?? "⛔ **DM Firewall Active**: I do not accept commands in Direct Messages for security reasons.";
  }

  static getInstance(config?: DMFirewallConfig): DMFirewall {
    if (!DMFirewall.instance) {
      DMFirewall.instance = new DMFirewall(config);
    }
    return DMFirewall.instance;
  }

  static resetInstance(): void {
    DMFirewall.instance = undefined as any;
  }

  setEnabled(status: boolean): void {
    this.enabled = status;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  handle(message: Message): boolean {
    if (!this.enabled) return false;
    if (!message.guild) {
      message.reply(this.replyMessage).catch(() => {});
      return true; // Blocked
    }
    return false; // Passed
  }
}

export interface SlashOnlyConfig {
  enabled?: boolean;
}

export class SlashOnly {
  private static instance: SlashOnly;
  private enabled: boolean;

  private constructor(config: SlashOnlyConfig = {}) {
    this.enabled = config.enabled ?? false;
  }

  static getInstance(config?: SlashOnlyConfig): SlashOnly {
    if (!SlashOnly.instance) {
      SlashOnly.instance = new SlashOnly(config);
    }
    return SlashOnly.instance;
  }

  static resetInstance(): void {
    SlashOnly.instance = undefined as any;
  }

  setEnabled(status: boolean): void {
    this.enabled = status;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  checkMessage(message: Message): boolean {
    if (!this.enabled) return false;
    
    // If it's a prefix command, do not block it
    if (message.content.trim().startsWith("!")) {
      return false;
    }
    
    return true;
  }
}