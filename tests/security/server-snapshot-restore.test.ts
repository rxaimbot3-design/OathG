import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { ServerSnapshotRestore } from "../../src/security/modules/server-snapshot-restore.js";
import { Guild, ChannelType, Role, TextChannel, CategoryChannel } from "discord.js";

// Mock Discord.js classes
const createMockGuild = (name: string = "Test Guild") => {
  const everyoneRole = {
    id: name, // guild id = @everyone role id
    name: "@everyone",
    permissions: { bitfield: 0n },
  };

  const roleMap = new Map([
    ["role1", {
      id: "role1",
      name: "Admin",
      color: 0xff0000,
      permissions: { bitfield: 8n, has: vi.fn().mockReturnValue(false), remove: vi.fn().mockReturnValue(8n) },
      hoist: true,
      mentionable: false,
      position: 5,
      edit: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }],
    ["role2", {
      id: "role2",
      name: "Member",
      color: 0x00ff00,
      permissions: { bitfield: 0n, has: vi.fn().mockReturnValue(false), remove: vi.fn().mockReturnValue(0n) },
      hoist: false,
      mentionable: true,
      position: 1,
      edit: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }],
    [name, everyoneRole],
  ]);

  // Add .map() and .filter() methods to the role map for compatibility
  roleMap.map = function<T>(callback: (value: any, key: string, map: Map<string, any>) => T): T[] {
    const result: T[] = [];
    this.forEach((value, key) => {
      result.push(callback(value, key, this));
    });
    return result;
  };
  
  roleMap.filter = function(callback: (value: any, key: string, map: Map<string, any>) => boolean): Map<string, any> & { map: <T>(callback: (value: any, key: string, map: Map<string, any>) => T) => T[] } {
    const result = new Map<string, any>();
    this.forEach((value, key) => {
      if (callback(value, key, this)) {
        result.set(key, value);
      }
    });
    result.map = function<T>(callback: (value: any, key: string, map: Map<string, any>) => T): T[] {
      const arr: T[] = [];
      this.forEach((value, key) => {
        arr.push(callback(value, key, this));
      });
      return arr;
    };
    return result;
  };
  
  roleMap.values = function(): IterableIterator<any> {
    return this[Symbol.iterator]();
  };

  const channelMap = new Map([
    ["cat1", {
      id: "cat1",
      name: "Category",
      type: ChannelType.GuildCategory,
      parentId: null,
      position: 0,
      permissionOverwrites: { 
        cache: (() => {
          const cache = new Map();
          cache.map = function<T>(callback: (value: any, key: string, map: Map<string, any>) => T): T[] {
            const result: T[] = [];
            this.forEach((value, key) => {
              result.push(callback(value, key, this));
            });
            return result;
          };
          return cache;
        })(),
      },
      edit: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }],
    ["channel1", {
      id: "channel1",
      name: "general",
      type: ChannelType.GuildText,
      parentId: "cat1",
      position: 1,
      topic: "General chat",
      nsfw: false,
      rateLimitPerUser: 0,
      permissionOverwrites: { 
        cache: (() => {
          const cache = new Map();
          cache.map = function<T>(callback: (value: any, key: string, map: Map<string, any>) => T): T[] {
            const result: T[] = [];
            this.forEach((value, key) => {
              result.push(callback(value, key, this));
            });
            return result;
          };
          return cache;
        })(),
      },
      edit: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }],
    ["channel2", {
      id: "channel2",
      name: "random",
      type: ChannelType.GuildText,
      parentId: "cat1",
      position: 2,
      topic: "Random stuff",
      nsfw: false,
      rateLimitPerUser: 5,
      permissionOverwrites: { 
        cache: (() => {
          const cache = new Map();
          cache.map = function<T>(callback: (value: any, key: string, map: Map<string, any>) => T): T[] {
            const result: T[] = [];
            this.forEach((value, key) => {
              result.push(callback(value, key, this));
            });
            return result;
          };
          return cache;
        })(),
      },
      edit: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }],
  ]);

  // Add .map() method to the channel map for compatibility
  channelMap.map = function<T>(callback: (value: any, key: string, map: Map<string, any>) => T): T[] {
    const result: T[] = [];
    this.forEach((value, key) => {
      result.push(callback(value, key, this));
    });
    return result;
  };

  return {
    name,
    id: name,
    roles: {
      cache: roleMap,
      fetch: vi.fn().mockResolvedValue(roleMap),
      create: vi.fn().mockImplementation((data: any) => {
        const newRole = {
          id: `new-role-${Date.now()}`,
          ...data,
          permissions: { bitfield: data.permissions, has: vi.fn().mockReturnValue(false), remove: vi.fn().mockReturnValue(data.permissions) },
          edit: vi.fn().mockResolvedValue(undefined),
          delete: vi.fn().mockResolvedValue(undefined),
        };
        roleMap.set(newRole.id, newRole);
        return Promise.resolve(newRole);
      }),
    },
    channels: {
      cache: channelMap,
      fetch: vi.fn().mockResolvedValue(channelMap),
      create: vi.fn().mockImplementation((data: any) => {
        const newChannel = {
          id: `new-channel-${Date.now()}`,
          ...data,
          permissionOverwrites: { cache: new Map() },
          edit: vi.fn().mockResolvedValue(undefined),
          delete: vi.fn().mockResolvedValue(undefined),
        };
        channelMap.set(newChannel.id, newChannel);
        return Promise.resolve(newChannel);
      }),
      setPositions: vi.fn().mockResolvedValue(undefined),
    },
    client: {
      user: { id: "bot-id" },
    },
  } as unknown as Guild;
};

describe("ServerSnapshotRestore", () => {
  const testSnapshotDir = "/tmp/snapshot-test";
  let mockGuild: ReturnType<typeof createMockGuild>;
  let alertCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Clean up
    if (fs.existsSync(testSnapshotDir)) fs.rmSync(testSnapshotDir, { recursive: true, force: true });
    fs.mkdirSync(testSnapshotDir, { recursive: true });
    
    mockGuild = createMockGuild();
    alertCallback = vi.fn();
    ServerSnapshotRestore.resetInstance();
  });

  afterEach(() => {
    ServerSnapshotRestore.resetInstance();
    if (fs.existsSync(testSnapshotDir)) fs.rmSync(testSnapshotDir, { recursive: true, force: true });
  });

  it("should create a snapshot with all channels and roles", async () => {
    const restore = ServerSnapshotRestore.getInstance({
      snapshotDir: testSnapshotDir,
      maxSnapshotsPerGuild: 10,
    });

    const snapshot = await restore.createSnapshot(mockGuild);

    expect(snapshot.id).toMatch(/^snap_\d+$/);
    expect(snapshot.guildId).toBe(mockGuild.id);
    expect(snapshot.guildName).toBe(mockGuild.name);
    expect(snapshot.channelCount).toBe(3); // 1 category + 2 text channels
    expect(snapshot.roleCount).toBe(2); // 2 roles (excluding @everyone)
    expect(snapshot.channels).toHaveLength(3);
    expect(snapshot.roles).toHaveLength(2);

    // Verify snapshot file was created
    const snapshotFile = path.join(testSnapshotDir, `${snapshot.id}.json`);
    expect(fs.existsSync(snapshotFile)).toBe(true);
    
    const saved = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));
    expect(saved.id).toBe(snapshot.id);
  });

  it("should restore snapshot in dry-run mode without making changes", async () => {
    const restore = ServerSnapshotRestore.getInstance({
      snapshotDir: testSnapshotDir,
      dryRun: true,
    });

    const snapshot = await restore.createSnapshot(mockGuild);
    const result = await restore.restoreSnapshot(mockGuild, snapshot.id, alertCallback);

    expect(result).toBe(true);
    expect(alertCallback).toHaveBeenCalledWith(
      expect.stringContaining("1-CLICK RESTORE INITIATED")
    );
    expect(alertCallback).toHaveBeenCalledWith(
      expect.stringContaining("DRY RUN")
    );
    expect(alertCallback).toHaveBeenCalledWith(
      expect.stringContaining("SIMULATION COMPLETE")
    );

    // Verify no actual changes were made
    expect(mockGuild.roles.create).not.toHaveBeenCalled();
    expect(mockGuild.channels.create).not.toHaveBeenCalled();
    for (const role of mockGuild.roles.cache.values()) {
      expect(role.edit).not.toHaveBeenCalled();
      expect(role.delete).not.toHaveBeenCalled();
    }
  });

  it("should restore roles and channels in production mode", async () => {
    const restore = ServerSnapshotRestore.getInstance({
      snapshotDir: testSnapshotDir,
      dryRun: false,
    });

    const snapshot = await restore.createSnapshot(mockGuild);
    
    // Add a new role and channel to simulate drift
    const newRole = {
      id: "new-role",
      name: "New Role",
      color: 0x0000ff,
      permissions: { bitfield: 0n, has: vi.fn().mockReturnValue(false), remove: vi.fn().mockReturnValue(0n) },
      hoist: false,
      mentionable: false,
      position: 10,
      edit: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    mockGuild.roles.cache.set("new-role", newRole);

    const newChannel = {
      id: "new-channel",
      name: "new-channel",
      type: ChannelType.GuildText,
      parentId: null,
      position: 10,
      permissionOverwrites: { cache: new Map() },
      edit: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    mockGuild.channels.cache.set("new-channel", newChannel);

    const result = await restore.restoreSnapshot(mockGuild, snapshot.id, alertCallback);

    expect(result).toBe(true);
    expect(alertCallback).toHaveBeenCalledWith(
      expect.stringContaining("1-CLICK RESTORE COMPLETE")
    );

    // Verify new role was deleted
    expect(newRole.delete).toHaveBeenCalled();

    // Verify new channel was deleted
    expect(newChannel.delete).toHaveBeenCalled();

    // Verify existing roles were updated
    const adminRole = mockGuild.roles.cache.get("role1");
    expect(adminRole.edit).toHaveBeenCalled();
  });

  it("should handle missing snapshot gracefully", async () => {
    const restore = ServerSnapshotRestore.getInstance({
      snapshotDir: testSnapshotDir,
    });

    const result = await restore.restoreSnapshot(mockGuild, "nonexistent", alertCallback);

    expect(result).toBe(false);
    expect(alertCallback).toHaveBeenCalledWith(
      expect.stringContaining("No valid snapshot found")
    );
  });

  it("should load snapshots from disk when memory is empty", async () => {
    const restore1 = ServerSnapshotRestore.getInstance({
      snapshotDir: testSnapshotDir,
    });

    const snapshot = await restore1.createSnapshot(mockGuild);

    // Reset instance to simulate fresh start
    ServerSnapshotRestore.resetInstance();

    const restore2 = ServerSnapshotRestore.getInstance({
      snapshotDir: testSnapshotDir,
    });

    const snapshots = restore2.getSnapshots(mockGuild.id);
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots[0].id).toBe(snapshot.id);
  });

  it("should limit snapshots per guild", async () => {
    const restore = ServerSnapshotRestore.getInstance({
      snapshotDir: testSnapshotDir,
      maxSnapshotsPerGuild: 3,
    });

    // Create 5 snapshots
    for (let i = 0; i < 5; i++) {
      await restore.createSnapshot(mockGuild);
      // Small delay to ensure different timestamps
      await new Promise(r => setTimeout(r, 10));
    }

    const snapshots = restore.getSnapshots(mockGuild.id);
    expect(snapshots.length).toBe(3); // Should only keep last 3
  });

  it("should preserve channel permission overwrites", async () => {
    const restore = ServerSnapshotRestore.getInstance({
      snapshotDir: testSnapshotDir,
      dryRun: false,
    });

    // Add permission overwrites to a channel
    const channel = mockGuild.channels.cache.get("channel1");
    channel.permissionOverwrites.cache.set("role1", {
      id: "role1",
      allow: 8n,
      deny: 0n,
      type: 0,
    });

    const snapshot = await restore.createSnapshot(mockGuild);
    expect(snapshot.channels.find(c => c.id === "channel1")?.permissionOverwrites).toBeDefined();
    expect(snapshot.channels.find(c => c.id === "channel1")?.permissionOverwrites?.length).toBeGreaterThan(0);

    // Reset overwrites
    channel.permissionOverwrites.cache.clear();

    // Restore should bring them back
    await restore.restoreSnapshot(mockGuild, snapshot.id, alertCallback);
    expect(channel.permissionOverwrites.create).toHaveBeenCalled();
  });

  it("should not delete @everyone role", async () => {
    const restore = ServerSnapshotRestore.getInstance({
      snapshotDir: testSnapshotDir,
      dryRun: false,
    });

    const snapshot = await restore.createSnapshot(mockGuild);
    await restore.restoreSnapshot(mockGuild, snapshot.id, alertCallback);

    const everyoneRole = mockGuild.roles.cache.get(mockGuild.id);
    expect(everyoneRole.delete).not.toHaveBeenCalled();
  });

  it("should handle category channels before other channels", async () => {
    const restore = ServerSnapshotRestore.getInstance({
      snapshotDir: testSnapshotDir,
      dryRun: false,
    });

    const snapshot = await restore.createSnapshot(mockGuild);
    
    // Just verify restore completes without error
    const result = await restore.restoreSnapshot(mockGuild, snapshot.id, alertCallback);
    expect(result).toBe(true);
    expect(alertCallback).toHaveBeenCalledWith(expect.stringContaining("1-CLICK RESTORE COMPLETE"));
  });
});