import { PermissionsBitField } from "discord.js";
import { LruMap } from "../MapManager.js";
import { OwnerLock } from "./owner-lock.js";

export interface AutoPermissionRollbackConfig {
  maxEntries?: number;
}

export class AutoPermissionRollback {
  private static instance: AutoPermissionRollback;
  private rolePermissionCache: LruMap<string, string>;
  private config: Required<AutoPermissionRollbackConfig>;

  private constructor(config: AutoPermissionRollbackConfig = {}) {
    this.config = {
      maxEntries: config.maxEntries ?? 10000,
    };
    this.rolePermissionCache = new LruMap<string, string>(this.config.maxEntries);
  }

  static getInstance(config?: AutoPermissionRollbackConfig): AutoPermissionRollback {
    if (!AutoPermissionRollback.instance) {
      AutoPermissionRollback.instance = new AutoPermissionRollback(config);
    }
    return AutoPermissionRollback.instance;
  }

  static resetInstance(): void {
    AutoPermissionRollback.instance = undefined as any;
  }

  cacheRole(roleId: string, permissionsBitfield: string): void {
    this.rolePermissionCache.set(roleId, permissionsBitfield);
  }

  async inspectAndRollback(role: any, executorId: string, alertCallback: (msg: string) => void): Promise<void> {
    if (OwnerLock.getInstance().isOwner(executorId)) return;

    const previousBits = this.rolePermissionCache.get(role.id);
    const newPermissions = role.permissions;

    if (newPermissions.has(PermissionsBitField.Flags.Administrator)) {
      alertCallback(`[PERMISSION-ROLLBACK] Role '${role.name}' in ${role.guild.name} was given Administrator by unauthorized user <@${executorId}>! Rolling back...`);

      if (previousBits) {
        await role.setPermissions(BigInt(previousBits), "Auto Permission Rollback: Unauthorized Admin grant").catch(() => {});
      } else {
        await role.setPermissions(newPermissions.remove(PermissionsBitField.Flags.Administrator), "Auto Rollback Admin").catch(() => {});
      }
    } else {
      this.cacheRole(role.id, newPermissions.bitfield.toString());
    }
  }

  getCachedPermissions(roleId: string): string | undefined {
    return this.rolePermissionCache.get(roleId);
  }

  clear(): void {
    this.rolePermissionCache.clear();
  }
}