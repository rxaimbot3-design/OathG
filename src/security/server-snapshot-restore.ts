/**
 * ServerSnapshotRestore - 1-click server state backup and restore.
 * Instance-based implementation for use with GuildContext.
 */

import type { SecurityModule } from "../core/interfaces/SecurityModule";
import type { Guild } from "discord.js";

export interface ServerSnapshotData {
  id: string;
  guildId: string;
  guildName: string;
  timestamp: string;
  channelCount: number;
  roleCount: number;
  channels: Array<any>;
  roles: Array<any>;
}

export class ServerSnapshotRestoreInstance implements SecurityModule {
  readonly name = "serverSnapshotRestore";
  private snapshotStore = new Map<string, ServerSnapshotData[]>();

  init(): void {
    // Nothing to initialize
  }

  async createSnapshot(guild: Guild): Promise<ServerSnapshotData> {
    if (guild.channels.cache.size === 0) {
      await guild.channels.fetch().catch(() => {});
    }
    if (guild.roles.cache.size === 0) {
      await guild.roles.fetch().catch(() => {});
    }

    const snapshot: ServerSnapshotData = {
      id: `snapshot_${Date.now()}`,
      guildId: guild.id,
      guildName: guild.name,
      timestamp: new Date().toISOString(),
      channelCount: guild.channels.cache.size,
      roleCount: guild.roles.cache.size,
      channels: Array.from(guild.channels.cache.values()).map((c: any) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        parentId: c.parentId,
        parentName: c.parent?.name,
        position: c.position,
        topic: c.topic,
        nsfw: c.nsfw,
        rateLimitPerUser: c.rateLimitPerUser,
        permissionOverwrites: c.permissionOverwrites?.map((po: any) => ({
          id: po.id,
          allow: po.allow?.bitfield?.toString() || "0",
          deny: po.deny?.bitfield?.toString() || "0",
          type: po.type
        }))
      })),
      roles: Array.from(guild.roles.cache.values()).map((r: any) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        permissions: r.permissions?.bitfield?.toString() || "0",
        hoist: r.hoist,
        mentionable: r.mentionable,
        position: r.position
      }))
    };

    const existing = this.snapshotStore.get(guild.id) || [];
    this.snapshotStore.set(guild.id, [snapshot, ...existing].slice(0, 10));

    return snapshot;
  }

  getSnapshots(guildId: string): ServerSnapshotData[] {
    return this.snapshotStore.get(guildId) || [];
  }

  async restoreSnapshot(guild: Guild, snapshotId: string): Promise<boolean> {
    const snapshots = this.snapshotStore.get(guild.id) || [];
    const snapshot = snapshots.find(s => s.id === snapshotId);
    if (!snapshot) return false;

    // Restore roles
    for (const roleData of snapshot.roles) {
      const existing = guild.roles.cache.find(r => r.name === roleData.name);
      if (!existing) {
        await guild.roles.create({
          name: roleData.name,
          color: roleData.color,
          permissions: BigInt(roleData.permissions || "0"),
          hoist: roleData.hoist || false,
          mentionable: roleData.mentionable || false
        }).catch(() => {});
      }
    }

    // Restore channels
    for (const channelData of snapshot.channels) {
      const existing = guild.channels.cache.find(c => c.name === channelData.name);
      if (!existing) {
        await guild.channels.create({
          name: channelData.name,
          type: channelData.type,
          parent: channelData.parentId,
          topic: channelData.topic
        }).catch(() => {});
      }
    }

    return true;
  }
}

/**
 * Global singleton instance (backwards compatibility).
 * @deprecated Use GuildContext.getServerSnapshotRestore() instead.
 */
export const ServerSnapshotRestore = new ServerSnapshotRestoreInstance();
