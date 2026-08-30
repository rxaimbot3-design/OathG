export interface AntiInviteShieldConfig {
  enabled?: boolean;
  inviteRegex?: RegExp;
}

export class AntiInviteShield {
  private static instance: AntiInviteShield;
  private enabled: boolean;
  private inviteRegex: RegExp;

  private constructor(config: AntiInviteShieldConfig = {}) {
    this.enabled = config.enabled ?? false;
    this.inviteRegex = config.inviteRegex ?? /(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/.+/i;
  }

  static getInstance(config?: AntiInviteShieldConfig): AntiInviteShield {
    if (!AntiInviteShield.instance) {
      AntiInviteShield.instance = new AntiInviteShield(config);
    }
    return AntiInviteShield.instance;
  }

  static resetInstance(): void {
    AntiInviteShield.instance = undefined as any;
  }

  setEnabled(status: boolean): void {
    this.enabled = status;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  containsInvite(content: string): boolean {
    if (!this.enabled) return false;
    return this.inviteRegex.test(content);
  }

  setCustomRegex(regex: RegExp): void {
    this.inviteRegex = regex;
  }

  // Static wrapper methods for backward compatibility
  static setEnabled(status: boolean): void {
    return this.getInstance().setEnabled(status);
  }

  static isEnabled(): boolean {
    return this.getInstance().isEnabled();
  }

  static containsInvite(content: string): boolean {
    return this.getInstance().containsInvite(content);
  }

  static setCustomRegex(regex: RegExp): void {
    return this.getInstance().setCustomRegex(regex);
  }
}