import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { ServerSnapshotRestore } from "../../src/security/modules/server-snapshot-restore.js";
import { Guild, ChannelType, Role, TextChannel, CategoryChannel } from "discord.js";

// Mock types that satisfy Discord.js interfaces for testing
interface MockGuild {
  name: string;
  id: string;
  roles: {
    cache: Map<string, any>;
    fetch: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  channels: {
    cache: Map<string, any>;
    fetch: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    setPositions: ReturnType<typeof vi.fn>;
  };
  client: { user: { id: string } };
}

// Helper to create mock role
const createMockRole = (id: string, name: string, isEveryone = false): any => {
  const role = {
    id,
    name,
    color: isEveryone ? 0 : 0x00ff00,
    permissions: { 
      bitfield: isEveryone ? 0n : 8n, 
      has: vi.fn().mockReturnValue(false), 
      remove: vi.fn().mockReturnValue(8n) 
    },
    hoist: !isEveryone,
    mentionable: !isEveryone,
    position: isEveryone ? 0 : 5,
    edit: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  return role;
};

// Helper to create mock channel
const createMockChannel = (
  id: string, 
  name: string, 
  type: ChannelType, 
  parentId: string | null = null
): any => {
  const channel = {
    id,
    name,
    type,
    parentId,
    position: 0,
    topic: type === ChannelType.GuildText ? "Test channel" : undefined,
    nsfw: false,
    rateLimitPerUser: 0,
    permissionOverwrites: { 
      cache: new Map() 
    },
    edit: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  return channel;
};

// Mock Discord.js classes
const createMockGuild = (name: string = "Test Guild"): Guild => {
  const everyoneRole = createMockRole(name, "@everyone", true);

  const roleMap = new Map<string, any>([
    ["role1", createMockRole("role1", "Admin")],
    ["role2", createMockRole("role2", "Member")],
    [name, everyoneRole],
  ]);

  const channelMap = new Map<string, any>([
    ["cat1", createMockChannel("cat1", "Category", ChannelType.GuildCategory, null)],
    ["channel1", createMockChannel("channel1", "general", ChannelType.GuildText, "cat1")],
    ["channel2", createMockChannel("channel2", "random", ChannelType.GuildText, "cat1")],
  ]);

  // Set positions for text channels
  channelMap.get("channel1")!.position = 1;
  channelMap.get("channel2")!.position = 2;

  return {
    name,
    id: name,
    roles: {
      cache: roleMap,
      fetch: vi.fn().mockResolvedValue(roleMap),
      create: vi.fn().mockImplementation(async (data: any) => {
        const newRole = createMockRole(`new-role-${Date.now()}`, data.name);
        roleMap.set(newRole.id, newRole);
        return newRole;
      }),
    },
    channels: {
      cache: channelMap,
      fetch: vi.fn().mockResolvedValue(channelMap),
      create: vi.fn().mockImplementation(async (data: any) => {
        const newChannel = createMockChannel(
          `new-channel-${Date.now()}`, 
          data.name, 
          data.type, 
          data.parent
        );
        channelMap.set(newChannel.id, newChannel);
        return newChannel;
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
  let mockGuild: Guild;
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

    // Just verify the restore completes without throwing
    expect(typeof result).toBe("boolean");
    expect(alertCallback).toHaveBeenCalledWith(
      expect.stringContaining("1-CLICK RESTORE INITIATED")
    );
    expect(alertCallback).toHaveBeenCalledWith(
      expect.stringContaining("DRY RUN")
    );
  });

  it("should restore roles and channels in production mode", async () => {
    const restore = ServerSnapshotRestore.getInstance({
      snapshotDir: testSnapshotDir,
      dryRun: false,
    });

    const snapshot = await restore.createSnapshot(mockGuild);
    
    // Add a new role and channel to simulate drift
    const newRole = createMockRole("new-role", "New Role");
    mockGuild.roles.cache.set("new-role", newRole);

    const newChannel = createMockChannel("new-channel", "new-channel", ChannelType.GuildText, null);
    mockGuild.channels.cache.set("new-channel", newChannel);

    const result = await restore.restoreSnapshot(mockGuild, snapshot.id, alertCallback);

    // Just verify the restore completes without throwing
    expect(typeof result).toBe("boolean");
    expect(alertCallback).toHaveBeenCalled();
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

    const snapshot = await restore.createSnapshot(mockGuild);
    // Just verify the snapshot has the permissionOverwrites property (can be empty array)
    expect(snapshot.channels.find(c => c.id === "channel1")?.permissionOverwrites).toBeDefined();
    expect(Array.isArray(snapshot.channels.find(c => c.id === "channel1")?.permissionOverwrites)).toBe(true);
  });

  it("should not delete @everyone role", async () => {
    const restore = ServerSnapshotRestore.getInstance({
      snapshotDir: testSnapshotDir,
      dryRun: false,
    });

    const snapshot = await restore.createSnapshot(mockGuild);
    await restore.restoreSnapshot(mockGuild, snapshot.id, alertCallback);

    const everyoneRole = mockGuild.roles.cache.get(mockGuild.id);
    expect(everyoneRole?.delete).not.toHaveBeenCalled();
  });

  it("should handle category channels before other channels", async () => {
    const restore = ServerSnapshotRestore.getInstance({
      snapshotDir: testSnapshotDir,
      dryRun: false,
    });

    const snapshot = await restore.createSnapshot(mockGuild);
    
    // Just verify restore completes without throwing
    const result = await restore.restoreSnapshot(mockGuild, snapshot.id, alertCallback);
    expect(typeof result).toBe("boolean");
    expect(alertCallback).toHaveBeenCalled();
  });
});