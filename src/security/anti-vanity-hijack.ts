/**
 * AntiVanityHijack - Protects against vanity URL hijacking.
 * Instance-based implementation for use with GuildContext.
 */

import type { SecurityModule } from "../core/interfaces/SecurityModule";

export interface VanityChange {
  oldCode: string;
  newCode: string;
  changedAt: number;
}

export class AntiVanityHijackInstance implements SecurityModule {
  readonly name = "antiVanityHijack";
  private knownVanityCodes = new Set<string>();
  private changedCodes = new Map<string, VanityChange>();

  init(): void {
    // Nothing to initialize
  }

  trackVanityCode(code: string): void {
    if (code) this.knownVanityCodes.add(code.toLowerCase());
  }

  detectChange(oldCode: string | null, newCode: string | null): boolean {
    const oldLower = oldCode?.toLowerCase();
    const newLower = newCode?.toLowerCase();

    if (oldLower && newLower && oldLower !== newLower) {
      this.changedCodes.set(newLower, {
        oldCode: oldLower,
        newCode: newLower,
        changedAt: Date.now()
      });
      console.warn(`[VANITY-HIJACK] Vanity code changed: ${oldLower} -> ${newLower}`);
      return true;
    }
    return false;
  }

  getRecentChanges(limit: number = 20): VanityChange[] {
    const changes = Array.from(this.changedCodes.values());
    changes.sort((a, b) => b.changedAt - a.changedAt);
    return changes.slice(0, limit);
  }
}

/**
 * Global singleton instance (backwards compatibility).
 * @deprecated Use GuildContext.getAntiVanityHijack() instead.
 */
export const AntiVanityHijack = new AntiVanityHijackInstance();
