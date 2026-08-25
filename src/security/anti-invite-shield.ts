/**
 * AntiInviteShield - Detects and blocks Discord invite links.
 * Instance-based implementation for use with GuildContext.
 */

import type { SecurityModule } from "../core/interfaces/SecurityModule";

const INVITE_REGEX = /(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/.+/i;

export class AntiInviteShieldInstance implements SecurityModule {
  readonly name = "antiInviteShield";
  private enabled = false;

  init(): void {
    // Nothing to initialize
  }

  setEnabled(status: boolean): void {
    this.enabled = status;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  containsInvite(content: string): boolean {
    if (!this.enabled) return false;
    return INVITE_REGEX.test(content);
  }

  scan(content: string): boolean {
    return this.containsInvite(content);
  }
}

/**
 * Global singleton instance (backwards compatibility).
 * @deprecated Use GuildContext.getAntiInviteShield() instead.
 */
export const AntiInviteShield = new AntiInviteShieldInstance();
