/**
 * AutoPermissionRollback - Reverts dangerous permission changes.
 * Instance-based implementation for use with GuildContext.
 */

import type { SecurityModule } from "../core/interfaces/SecurityModule";

export interface PermissionChange {
  guildId: string;
  roleId: string;
  oldPerms: bigint;
  newPerms: bigint;
  timestamp: number;
}

export class AutoPermissionRollbackInstance implements SecurityModule {
  readonly name = "autoPermissionRollback";
  private pendingRollbacks = new Map<string, PermissionChange[]>();

  init(): void {
    // Nothing to initialize
  }

  recordPermissionChange(guildId: string, roleId: string, oldPerms: bigint, newPerms: bigint): void {
    // Only record if permissions were elevated
    if (newPerms > oldPerms) {
      const changes = this.pendingRollbacks.get(guildId) || [];
      changes.push({
        guildId,
        roleId,
        oldPerms,
        newPerms,
        timestamp: Date.now()
      });
      this.pendingRollbacks.set(guildId, changes);
    }
  }

  getPendingRollbacks(guildId: string): PermissionChange[] {
    return this.pendingRollbacks.get(guildId) || [];
  }

  clearRollbacks(guildId: string): void {
    this.pendingRollbacks.delete(guildId);
  }

  hasPendingRollbacks(guildId: string): boolean {
    return this.pendingRollbacks.has(guildId);
  }
}

/**
 * Global singleton instance (backwards compatibility).
 * @deprecated Use GuildContext.getAutoPermissionRollback() instead.
 */
export const AutoPermissionRollback = new AutoPermissionRollbackInstance();
