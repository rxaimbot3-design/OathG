/**
 * OwnerLock enforces zero-trust owner validation.
 * Owners are configured exclusively via DISCORD_OWNER_ID and ALLOWED_OWNERS environment variables,
 * or registered dynamically at runtime.
 */

export interface OwnerLockConfig {
  allowedOwners?: string[];
  discordOwnerId?: string;
  allowedOwnersEnv?: string;
}

export class OwnerLock {
  private static instance: OwnerLock;
  private _allowedOwners: string[] = [];
  private _cachedOwners: string[] = [];
  private _cacheValid = false;
  private config: OwnerLockConfig;

  private constructor(config: OwnerLockConfig = {}) {
    this.config = config;
  }

  static getInstance(config?: OwnerLockConfig): OwnerLock {
    if (!OwnerLock.instance) {
      OwnerLock.instance = new OwnerLock(config);
    }
    return OwnerLock.instance;
  }

  static resetInstance(): void {
    OwnerLock.instance = undefined as any;
  }

  get allowedOwners(): string[] {
    if (!this._cacheValid) {
      const envOwners = (this.config.allowedOwnersEnv || process.env.ALLOWED_OWNERS || this.config.discordOwnerId || process.env.DISCORD_OWNER_ID || "")
        .split(",")
        .map(id => id.trim())
        .filter(id => id.length > 0);

      if (envOwners.length === 0 && this._allowedOwners.length === 0) {
        console.warn("⚠️ [OwnerLock Warning] Neither DISCORD_OWNER_ID nor ALLOWED_OWNERS is set in environment variables!");
      }

      const combined = new Set([...this._allowedOwners, ...envOwners]);
      this._cachedOwners = Array.from(combined);
      this._cacheValid = true;
    }
    return this._cachedOwners;
  }

  addOwner(userId: string): void {
    if (userId && !this._allowedOwners.includes(userId)) {
      this._allowedOwners.push(userId);
      this._cacheValid = false;
    }
  }

  removeOwner(userId: string): void {
    this._allowedOwners = this._allowedOwners.filter(id => id !== userId);
    this._cacheValid = false;
  }

  isOwner(userId: string, guildOwnerId?: string): boolean {
    if (!userId) return false;
    if (guildOwnerId && userId === guildOwnerId) return true;
    return this.allowedOwners.includes(userId);
  }

  enforce(userId: string, guildOwnerId?: string): boolean {
    if (!this.isOwner(userId, guildOwnerId)) {
      console.warn(`[OwnerLock] Unauthorized Access Attempt by ${userId}`);
      return false;
    }
    return true;
  }

  // Throw instead of returning false - for critical operations
  enforceOrThrow(userId: string, guildOwnerId?: string, operation: string = "operation"): void {
    if (!this.enforce(userId, guildOwnerId)) {
      throw new Error(`[OwnerLock] Access denied: ${operation} requires owner privileges`);
    }
  }

  getConfig(): Readonly<OwnerLockConfig> {
    return { ...this.config };
  }

  getOwners(): string[] {
    return [...this.allowedOwners];
  }

  // Static wrapper methods for backward compatibility
  static isOwner(userId: string, guildOwnerId?: string): boolean {
    return this.getInstance().isOwner(userId, guildOwnerId);
  }

  static enforce(userId: string, guildOwnerId?: string): boolean {
    return this.getInstance().enforce(userId, guildOwnerId);
  }

  static enforceOrThrow(userId: string, guildOwnerId?: string, operation: string = "operation"): void {
    return this.getInstance().enforceOrThrow(userId, guildOwnerId, operation);
  }

  static addOwner(userId: string): void {
    return this.getInstance().addOwner(userId);
  }

  static removeOwner(userId: string): void {
    return this.getInstance().removeOwner(userId);
  }
}