import { TtlMap } from "../MapManager.js";

export interface AntiVanityHijackConfig {
  maxEntries?: number;
  ttlMs?: number;
}

export interface VanityChangeRecord {
  oldCode: string;
  newCode: string;
  changedAt: number;
}

export class AntiVanityHijack {
  private static instance: AntiVanityHijack;
  private knownVanityCodes: Set<string>;
  private changedCodes: TtlMap<string, VanityChangeRecord>;
  private config: Required<AntiVanityHijackConfig>;

  private constructor(config: AntiVanityHijackConfig = {}) {
    this.config = {
      maxEntries: config.maxEntries ?? 10000,
      ttlMs: config.ttlMs ?? 24 * 60 * 60 * 1000,
    };
    this.knownVanityCodes = new Set<string>();
    this.changedCodes = new TtlMap<string, VanityChangeRecord>({
      ttlMs: this.config.ttlMs,
      maxEntries: this.config.maxEntries,
      autoCleanupMs: 300000,
    });
  }

  static getInstance(config?: AntiVanityHijackConfig): AntiVanityHijack {
    if (!AntiVanityHijack.instance) {
      AntiVanityHijack.instance = new AntiVanityHijack(config);
    }
    return AntiVanityHijack.instance;
  }

  static resetInstance(): void {
    AntiVanityHijack.instance = undefined as any;
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

  getRecentChanges(limit = 20): VanityChangeRecord[] {
    const changes = Array.from(this.changedCodes.values());
    changes.sort((a, b) => b.changedAt - a.changedAt);
    return changes.slice(0, limit);
  }

  getKnownCodes(): string[] {
    return Array.from(this.knownVanityCodes);
  }

  clear(): void {
    this.knownVanityCodes.clear();
    this.changedCodes.clear();
  }

  // Static wrapper methods for backward compatibility
  static trackVanityCode(code: string): void {
    return this.getInstance().trackVanityCode(code);
  }

  static detectChange(oldCode: string | null, newCode: string | null): boolean {
    return this.getInstance().detectChange(oldCode, newCode);
  }

  static getRecentChanges(limit = 20): VanityChangeRecord[] {
    return this.getInstance().getRecentChanges(limit);
  }

  static getKnownCodes(): string[] {
    return this.getInstance().getKnownCodes();
  }

  static clear(): void {
    return this.getInstance().clear();
  }
}