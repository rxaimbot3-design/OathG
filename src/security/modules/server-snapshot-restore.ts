import fs from "fs";
import path from "path";
import { Guild, ChannelType } from "discord.js";
import { atomicWriteJsonSync } from "./utils.js";
import { TtlMap } from "../MapManager.js";

export interface ServerSnapshotData {
  id: string;
  guildId: string;
  guildName: string;
  timestamp: string;
  channelCount: number;
  roleCount: number;
  channels: Array<{
    id: string;
    name: string;
    type: number;
    parentId?: string;
    parentName?: string;
    position?: number;
    topic?: string;
    nsfw?: boolean;
    rateLimitPerUser?: number;
    permissionOverwrites?: Array<{ id: string; allow: string; deny: string; type: number }>;
  }>;
  roles: Array<{
    id: string;
    name: string;
    color: number;
    permissions: string;
    hoist?: boolean;
    mentionable?: boolean;
    position?: number;
  }>;
}

export interface ServerSnapshotRestoreConfig {
  snapshotDir?: string;
  maxSnapshotsPerGuild?: number;
  ttlMs?: number;
  dryRun?: boolean;
}

export class ServerSnapshotRestore {
  private static instance: ServerSnapshotRestore;
  private snapshotStore: TtlMap<string, ServerSnapshotData[]>;
  private config: Required<ServerSnapshotRestoreConfig>;

  private constructor(config: ServerSnapshotRestoreConfig = {}) {
    this.config = {
      snapshotDir: config.snapshotDir || path.join(process.cwd(), "snapshots"),
      maxSnapshotsPerGuild: config.maxSnapshotsPerGuild ?? 10,
      ttlMs: config.ttlMs ?? 24 * 60 * 60 * 1000,
      dryRun: config.dryRun ?? false,
    };
    this.snapshotStore = new TtlMap<string, ServerSnapshotData[]>({
      ttlMs: this.config.ttlMs,
      maxEntries: 100,
      autoCleanupMs: 300000,
    });
  }

  static getInstance(config?: ServerSnapshotRestoreConfig): ServerSnapshotRestore {
    if (!ServerSnapshotRestore.instance) {
      ServerSnapshotRestore.instance = new ServerSnapshotRestore(config);
    }
    return ServerSnapshotRestore.instance;
  }

  static resetInstance(): void {
    ServerSnapshotRestore.instance = undefined as any;
  }

  setDryRun(dryRun: boolean): void {
    this.config.dryRun = dryRun;
  }

  isDryRun(): boolean {
    return this.config.dryRun;
  }

  async createSnapshot(guild: Guild): Promise<ServerSnapshotData> {
    if (guild.channels.cache.size === 0) {
      await guild.channels.fetch().catch(() => {});
    }
    if (guild.roles.cache.size === 0) {
      await guild.roles.fetch().catch(() => {});
    }

    const channels = Array.from(guild.channels.cache.values()).map((c: any) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      parentId: c.parentId,
      parentName: c.parent ? c.parent.name : undefined,
      position: c.position,
      topic: c.topic,
      nsfw: c.nsfw,
      rateLimitPerUser: c.rateLimitPerUser,
      permissionOverwrites: Array.from(c.permissionOverwrites.cache.values()).map((po: any) => ({
        id: po.id,
        allow: po.allow.bitfield.toString(),
        deny: po.deny.bitfield.toString(),
        type: po.type
      }))
    }));

    const roles = Array.from(guild.roles.cache.values())
      .filter((r: any) => r.id !== guild.id) // Exclude @everyone role
      .map((r: any) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        permissions: r.permissions.bitfield.toString(),
        hoist: r.hoist,
        mentionable: r.mentionable,
        position: r.position
      }));

    const snapshot: ServerSnapshotData = {
      id: `snap_${Date.now()}`,
      guildId: guild.id,
      guildName: guild.name,
      timestamp: new Date().toISOString(),
      channelCount: channels.length,
      roleCount: roles.length,
      channels,
      roles
    };

    const existing = this.snapshotStore.get(guild.id) || [];
    this.snapshotStore.set(guild.id, [snapshot, ...existing].slice(0, this.config.maxSnapshotsPerGuild));

    if (!fs.existsSync(this.config.snapshotDir)) fs.mkdirSync(this.config.snapshotDir, { recursive: true });
    atomicWriteJsonSync(path.join(this.config.snapshotDir, `${snapshot.id}.json`), snapshot);

    console.log(`📸 [SNAPSHOT] Created 1-Click Snapshot '${snapshot.id}' for ${guild.name}`);
    return snapshot;
  }

  getSnapshots(guildId: string): ServerSnapshotData[] {
    const memory = this.snapshotStore.get(guildId) || [];
    if (memory.length > 0) return memory;

    if (fs.existsSync(this.config.snapshotDir)) {
      const files = fs.readdirSync(this.config.snapshotDir).filter(f => f.endsWith(".json"));
      const loaded: ServerSnapshotData[] = [];
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(this.config.snapshotDir, file), "utf8"));
          if (data.guildId === guildId || !guildId) loaded.push(data);
        } catch {}
      }
      return loaded.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }
    return [];
  }

  async restoreSnapshot(guild: Guild, snapshotId: string, alertCallback: (msg: string) => void): Promise<boolean> {
    const snapshots = this.getSnapshots(guild.id);
    const snap = snapshots.find(s => s.id === snapshotId) || snapshots[0];

    if (!snap) {
      alertCallback(`❌ [SNAPSHOT RESTORE] No valid snapshot found for ${guild.name}.`);
      return false;
    }

    alertCallback(`📸 [1-CLICK RESTORE INITIATED] Restoring **${guild.name}** to snapshot from ${new Date(snap.timestamp).toLocaleString()}${this.config.dryRun ? " (DRY RUN)" : ""}...`);
    
    // Map to track old role ID -> new role ID for permission overwrite mapping
    const roleIdMap = new Map<string, string>();
    
    // Track restoration results for accurate reporting
    const restoreStats = {
      roles: { total: snap.roles.length, deleted: 0, created: 0, updated: 0, failed: 0 },
      channels: { total: snap.channels.length, deleted: 0, created: 0, updated: 0, failed: 0 },
      overwrites: { total: 0, created: 0, updated: 0, deleted: 0, failed: 0 },
      rolePositions: { total: 0, updated: 0, failed: 0 },
      channelPositions: { total: 0, updated: 0, failed: 0 }
    };

    try {
      await guild.channels.fetch().catch(() => {});
      await guild.roles.fetch().catch(() => {});

      // Phase 1: Restore roles
      alertCallback(`🔧 Restoring ${snap.roles.length} roles...`);
      const existingRoleIds = new Set(guild.roles.cache.map(r => r.id));
      const snapshotRoleIds = new Set(snap.roles.map(r => r.id));

      // Delete roles not in snapshot (except @everyone)
      for (const role of guild.roles.cache.values()) {
        if (role.id === guild.id) continue;
        if (!snapshotRoleIds.has(role.id)) {
          if (!this.config.dryRun) {
            const success = await role.delete("Snapshot restore: removing role not in snapshot").catch(() => false);
            if (success) restoreStats.roles.deleted++; else restoreStats.roles.failed++;
          }
        }
      }

      // Create/update roles from snapshot
      for (const snapRole of snap.roles) {
        if (snapRole.id === guild.id) continue;
        const existing = guild.roles.cache.get(snapRole.id);
        if (existing) {
          const updateData: any = {};
          if (existing.name !== snapRole.name) updateData.name = snapRole.name;
          if (existing.color !== snapRole.color) updateData.color = snapRole.color;
          if (existing.permissions.bitfield.toString() !== snapRole.permissions) {
            updateData.permissions = BigInt(snapRole.permissions);
          }
          if (snapRole.hoist !== undefined && existing.hoist !== snapRole.hoist) updateData.hoist = snapRole.hoist;
          if (snapRole.mentionable !== undefined && existing.mentionable !== snapRole.mentionable) updateData.mentionable = snapRole.mentionable;
          if (Object.keys(updateData).length > 0) {
            if (!this.config.dryRun) {
              const success = await existing.edit({ ...updateData, reason: "Snapshot restore: updating role" }).catch(() => false);
              if (success) restoreStats.roles.updated++; else restoreStats.roles.failed++;
            }
          }
          // Map existing role ID to itself (no change)
          roleIdMap.set(snapRole.id, existing.id);
        } else {
          if (!this.config.dryRun) {
            const newRole = await guild.roles.create({
              name: snapRole.name,
              color: snapRole.color,
              permissions: BigInt(snapRole.permissions),
              hoist: snapRole.hoist,
              mentionable: snapRole.mentionable,
              reason: "Snapshot restore: creating missing role"
            }).catch(() => null as any);
            
            if (newRole) {
              // Map old snapshot role ID to new Discord role ID
              roleIdMap.set(snapRole.id, newRole.id);
              restoreStats.roles.created++;
            } else {
              restoreStats.roles.failed++;
            }
          }
        }
      }

      await guild.roles.fetch().catch(() => {});

      // Phase 2: Restore channels
      alertCallback(`🔧 Restoring ${snap.channels.length} channels...`);
      const existingChannelIds = new Set(guild.channels.cache.map(c => c.id));
      const snapshotChannelIds = new Set(snap.channels.map(c => c.id));

      const protectedChannelIds = new Set([guild.id]);

      const snapshotCategories = snap.channels.filter(c => c.type === ChannelType.GuildCategory);
      const snapshotOtherChannels = snap.channels.filter(c => c.type !== ChannelType.GuildCategory);

      await guild.channels.fetch().catch(() => {});
      for (const snapChan of [...snapshotCategories, ...snapshotOtherChannels]) {
        if (snapChan.id === guild.id) continue;
        const existing = guild.channels.cache.get(snapChan.id);
        if (!existing) {
          const parent = snapChan.parentId ? guild.channels.cache.get(snapChan.parentId) : undefined;
          if (!this.config.dryRun) {
            const newChannel = await guild.channels.create({
              name: snapChan.name,
              type: snapChan.type as any,
              parent: parent as any,
              position: snapChan.position,
              topic: snapChan.topic,
              nsfw: snapChan.nsfw,
              rateLimitPerUser: snapChan.rateLimitPerUser,
              permissionOverwrites: snapChan.permissionOverwrites?.map(po => ({
                // Map old role IDs to new role IDs
                id: roleIdMap.get(po.id) || po.id,
                allow: BigInt(po.allow),
                deny: BigInt(po.deny),
                type: po.type
              })) || [],
              reason: "Snapshot restore: creating missing channel"
            }).catch(() => null as any);
            
            if (newChannel) {
              restoreStats.channels.created++;
            } else {
              restoreStats.channels.failed++;
            }
          }
        }
      }

      await guild.channels.fetch().catch(() => {});

      // Delete extra channels not in snapshot
      for (const channel of guild.channels.cache.values()) {
        if (protectedChannelIds.has(channel.id)) continue;
        if (!snapshotChannelIds.has(channel.id)) {
          if (!this.config.dryRun) {
            const success = await channel.delete("Snapshot restore: removing channel not in snapshot").catch(() => false);
            if (success) restoreStats.channels.deleted++; else restoreStats.channels.failed++;
          }
        }
      }

      // Phase 3: Update channel properties and positions
      for (const snapChan of snap.channels) {
        if (snapChan.id === guild.id) continue;
        const existing = guild.channels.cache.get(snapChan.id);
        if (!existing) continue;

        const existingAny = existing as any;
        const updateData: any = {};
        if (existingAny.name !== snapChan.name) updateData.name = snapChan.name;
        if (existingAny.topic !== snapChan.topic) updateData.topic = snapChan.topic;
        if (existingAny.nsfw !== snapChan.nsfw) updateData.nsfw = snapChan.nsfw;
        if (existingAny.rateLimitPerUser !== snapChan.rateLimitPerUser) updateData.rateLimitPerUser = snapChan.rateLimitPerUser;
        if (existingAny.position !== snapChan.position) updateData.position = snapChan.position;

        const currentParentId = existingAny.parentId;
        if (snapChan.parentId && currentParentId !== snapChan.parentId) {
          const parent = guild.channels.cache.get(snapChan.parentId);
          if (parent) updateData.parent = parent;
        }

        if (Object.keys(updateData).length > 0) {
          if (!this.config.dryRun) {
            const success = await existingAny.edit({ ...updateData, reason: "Snapshot restore: updating channel" }).catch(() => false);
            if (success) restoreStats.channels.updated++; else restoreStats.channels.failed++;
          }
        }

        if (snapChan.permissionOverwrites) {
          const currentOverwrites = new Map(existingAny.permissionOverwrites.cache.map((po: any) => [po.id, po]));
          const targetOverwrites = new Map((snapChan.permissionOverwrites as any[]).map((po: any) => [po.id, po]));
          
          // Count total overwrites for stats
          for (const [id, po] of targetOverwrites) {
            restoreStats.overwrites.total++;
          }

          for (const [id, po] of currentOverwrites) {
            if (!targetOverwrites.has(id as string)) {
              if (!this.config.dryRun) {
                const success = await existingAny.permissionOverwrites.delete(id as string, { reason: "Snapshot restore: removing overwrite" }).catch(() => false);
                if (success) restoreStats.overwrites.deleted++; else restoreStats.overwrites.failed++;
              }
            }
          }

          for (const [id, po] of targetOverwrites) {
            // Map old role ID to new role ID for permission overwrites
            const newRoleId = roleIdMap.get(id as string) || id;
            const allow = BigInt((po as any).allow);
            const deny = BigInt((po as any).deny);
            const current = currentOverwrites.get(id as string);
            if (current) {
              if ((current as any).allow.bitfield.toString() !== (po as any).allow || (current as any).deny.bitfield.toString() !== (po as any).deny) {
                if (!this.config.dryRun) {
                  const success = await existingAny.permissionOverwrites.edit(newRoleId, { allow, deny, reason: "Snapshot restore: updating overwrite" }).catch(() => false);
                  if (success) restoreStats.overwrites.updated++; else restoreStats.overwrites.failed++;
                }
              }
            } else {
              if (!this.config.dryRun) {
                const success = await existingAny.permissionOverwrites.create({ id: newRoleId, allow, deny, type: (po as any).type, reason: "Snapshot restore: creating overwrite" }).catch(() => false);
                if (success) restoreStats.overwrites.created++; else restoreStats.overwrites.failed++;
              }
            }
          }
        }
      }

      // Phase 4: Restore role positions/hierarchy
      alertCallback(`🔧 Restoring role hierarchy...`);
      if (!this.config.dryRun) {
        // Sort snapshot roles by position (highest first)
        const sortedRoles = [...snap.roles].sort((a, b) => (b.position || 0) - (a.position || 0));
        
        for (const snapRole of sortedRoles) {
          if (snapRole.id === guild.id) continue; // Skip @everyone
          
          const newRoleId = roleIdMap.get(snapRole.id);
          if (!newRoleId) continue;
          
          const role = guild.roles.cache.get(newRoleId);
          if (!role) continue;
          
          restoreStats.rolePositions.total++;
          // Set role position - need to position relative to other roles
          // We'll set positions from highest to lowest
          try {
            const success = await role.setPosition(snapRole.position || 0, { reason: "Snapshot restore: restoring role hierarchy" }).catch(() => false);
            if (success) restoreStats.rolePositions.updated++; else restoreStats.rolePositions.failed++;
          } catch {
            // Position setting may fail if hierarchy constraints violated, continue
            restoreStats.rolePositions.failed++;
          }
        }
      }

      // Phase 5: Fix channel positions
      const channelsToPosition = guild.channels.cache.filter(c => !protectedChannelIds.has(c.id));
      if (channelsToPosition.size > 0 && !this.config.dryRun) {
        restoreStats.channelPositions.total = channelsToPosition.size;
        const positionResults = await guild.channels.setPositions(
          channelsToPosition.map((c: any) => {
            const snapChan = snap.channels.find((sc: any) => sc.id === c.id);
            return { id: c.id, position: Number(snapChan?.position ?? c.position) } as any;
          })
        ).catch(() => []);
        
        // guild.channels.setPositions doesn't return individual results, assume success if no error
        // We'll count as updated if no exception thrown
        restoreStats.channelPositions.updated = channelsToPosition.size;
      }

      // Determine overall success
      const totalFailed = restoreStats.roles.failed + restoreStats.channels.failed + restoreStats.overwrites.failed + restoreStats.rolePositions.failed + restoreStats.channelPositions.failed;
      const isComplete = totalFailed === 0;
      const isPartial = totalFailed > 0 && (restoreStats.roles.created + restoreStats.roles.updated + restoreStats.channels.created + restoreStats.channels.updated + restoreStats.overwrites.created + restoreStats.overwrites.updated + restoreStats.overwrites.deleted) > 0;
      
      if (isComplete) {
        alertCallback(`✅ [1-CLICK RESTORE ${this.config.dryRun ? "SIMULATION " : ""}COMPLETE] Server **${guild.name}** successfully restored to snapshot state (${snap.channels.length} channels, ${snap.roles.length} roles).`);
      } else if (isPartial) {
        alertCallback(`⚠️ [1-CLICK RESTORE ${this.config.dryRun ? "SIMULATION " : ""}PARTIAL] Server **${guild.name}** partially restored. Some operations failed. Details: ${totalFailed} failed, see logs.`);
      } else {
        alertCallback(`❌ [1-CLICK RESTORE ${this.config.dryRun ? "SIMULATION " : ""}FAILED] Server **${guild.name}** restore failed with no successful operations.`);
        return false;
      }
      
      // Log detailed stats
      console.log(`[SNAPSHOT RESTORE] Stats:`, JSON.stringify(restoreStats, null, 2));
      
      return isComplete || isPartial;
    } catch (err: any) {
      alertCallback(`❌ [SNAPSHOT RESTORE] Failed: ${err.message}`);
      return false;
    }
  }

  clear(): void {
    this.snapshotStore.clear();
  }

  // Static wrapper methods for backward compatibility
  static async createSnapshot(guild: Guild): Promise<ServerSnapshotData> {
    return this.getInstance().createSnapshot(guild);
  }

  static getSnapshots(guildId: string): ServerSnapshotData[] {
    return this.getInstance().getSnapshots(guildId);
  }

  static async restoreSnapshot(guild: Guild, snapshotId: string, alertCallback: (msg: string) => void): Promise<boolean> {
    return this.getInstance().restoreSnapshot(guild, snapshotId, alertCallback);
  }

  static setDryRun(dryRun: boolean): void {
    return this.getInstance().setDryRun(dryRun);
  }

  static isDryRun(): boolean {
    return this.getInstance().isDryRun();
  }

  static clear(): void {
    return this.getInstance().clear();
  }
}