import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NukeDefense } from "../../src/security/modules/nuke-defense.js";
import { Guild, TextChannel, Role, PermissionOverwrites, ChannelType } from "discord.js";

// Mock Discord.js classes
const createMockGuild = (name: string = "Test Guild") => {
  const everyoneRole = {
    id: "everyone-role-id",
    name: "@everyone",
  };

  const channels = new Map([
    ["channel1", {
      id: "channel1",
      name: "general",
      type: ChannelType.GuildText,
      permissionOverwrites: {
        edit: vi.fn().mockResolvedValue(undefined),
      },
    }],
    ["channel2", {
      id: "channel2",
      name: "random",
      type: ChannelType.GuildText,
      permissionOverwrites: {
        edit: vi.fn().mockResolvedValue(undefined),
      },
    }],
    ["voice1", {
      id: "voice1",
      name: "voice-chat",
      type: ChannelType.GuildVoice,
      permissionOverwrites: {
        edit: vi.fn().mockResolvedValue(undefined),
      },
    }],
  ]);

  const invites = new Map([
    ["invite1", { delete: vi.fn().mockResolvedValue(undefined) }],
    ["invite2", { delete: vi.fn().mockResolvedValue(undefined) }],
  ]);

  return {
    name,
    id: "guild-123",
    roles: {
      everyone: everyoneRole,
      cache: new Map([["everyone-role-id", everyoneRole]]),
    },
    channels: {
      cache: channels,
    },
    invites: {
      fetch: vi.fn().mockResolvedValue(invites),
    },
    client: {
      user: { id: "bot-id" },
    },
  } as unknown as Guild;
};

describe("NukeDefense", () => {
  let mockGuild: Guild;
  let alertCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGuild = createMockGuild();
    alertCallback = vi.fn();
    NukeDefense.resetInstance();
  });

  afterEach(() => {
    NukeDefense.resetInstance();
  });

  it("should lock all text channels and revoke invites in production mode", async () => {
    const nuke = NukeDefense.getInstance({
      dryRun: false,
      lockChannels: true,
      revokeInvites: true,
      alertCallback,
    });

    const result = await nuke.lockdown(mockGuild);

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.channelsLocked).toBe(2); // 2 text channels
    expect(result.invitesRevoked).toBe(2);
    expect(result.errors).toHaveLength(0);

    // Verify alert was called
    expect(alertCallback).toHaveBeenCalledWith(
      expect.stringContaining("INITIATING 1-CLICK PANIC LOCKDOWN")
    );
    expect(alertCallback).toHaveBeenCalledWith(
      expect.stringContaining("LOCKDOWN SECURED")
    );
  });

  it("should simulate lockdown in dry-run mode without making changes", async () => {
    const nuke = NukeDefense.getInstance({
      dryRun: true,
      lockChannels: true,
      revokeInvites: true,
      alertCallback,
    });

    const result = await nuke.lockdown(mockGuild);

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.channelsLocked).toBe(2);
    expect(result.invitesRevoked).toBe(2);
    expect(result.errors).toHaveLength(0);

    // Verify channels were NOT actually modified
    const generalChannel = mockGuild.channels.cache.get("channel1");
    expect(generalChannel.permissionOverwrites.edit).not.toHaveBeenCalled();

    // Verify invites were NOT actually deleted
    const invites = await mockGuild.invites.fetch();
    for (const invite of invites.values()) {
      expect(invite.delete).not.toHaveBeenCalled();
    }
  });

  it("should only lock text channels, not voice channels", async () => {
    const nuke = NukeDefense.getInstance({
      dryRun: false,
      lockChannels: true,
      revokeInvites: false,
      alertCallback,
    });

    await nuke.lockdown(mockGuild);

    const generalChannel = mockGuild.channels.cache.get("channel1");
    const voiceChannel = mockGuild.channels.cache.get("voice1");

    expect(generalChannel.permissionOverwrites.edit).toHaveBeenCalledWith(
      mockGuild.roles.everyone,
      expect.objectContaining({
        SendMessages: false,
        AddReactions: false,
      })
    );

    // Voice channel should not have permissionOverwrites.edit called
    expect(voiceChannel.permissionOverwrites.edit).not.toHaveBeenCalled();
  });

  it("should handle invite fetch failures gracefully", async () => {
    // Make fetch throw an error that isn't caught by the .catch(() => null)
    mockGuild.invites.fetch = vi.fn().mockImplementation(() => {
      throw new Error("API Error");
    });

    const nuke = NukeDefense.getInstance({
      dryRun: false,
      lockChannels: true,
      revokeInvites: true,
      alertCallback,
    });

    const result = await nuke.lockdown(mockGuild);

    expect(result.success).toBe(false); // Success should be false when there are errors
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Failed to revoke invites");
  });

  it("should handle channel permission failures gracefully", async () => {
    const failingChannel = mockGuild.channels.cache.get("channel1");
    failingChannel.permissionOverwrites.edit = vi.fn().mockRejectedValue(new Error("Missing permissions"));

    const nuke = NukeDefense.getInstance({
      dryRun: false,
      lockChannels: true,
      revokeInvites: false,
      alertCallback,
    });

    const result = await nuke.lockdown(mockGuild);

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Failed to lock channel general");
  });

  it("should allow disabling channel locking", async () => {
    const nuke = NukeDefense.getInstance({
      dryRun: false,
      lockChannels: false,
      revokeInvites: true,
      alertCallback,
    });

    const result = await nuke.lockdown(mockGuild);

    expect(result.channelsLocked).toBe(0);
    expect(result.invitesRevoked).toBe(2);
  });

  it("should allow disabling invite revocation", async () => {
    const nuke = NukeDefense.getInstance({
      dryRun: false,
      lockChannels: true,
      revokeInvites: false,
      alertCallback,
    });

    const result = await nuke.lockdown(mockGuild);

    expect(result.channelsLocked).toBe(2);
    expect(result.invitesRevoked).toBe(0);
  });

  it("should update config dynamically", async () => {
    const nuke = NukeDefense.getInstance({
      dryRun: true,
      alertCallback,
    });

    expect(nuke.isDryRun()).toBe(true);

    nuke.setConfig({ dryRun: false });
    expect(nuke.isDryRun()).toBe(false);
  });
});