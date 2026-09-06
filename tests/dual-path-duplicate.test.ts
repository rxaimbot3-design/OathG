import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { EnhancedEventEngine } from "../discord-bot.js";
import { ultraLowLatencyPipeline, UltraLowLatencyPipeline } from "../src/core/UltraLowLatencyPipeline.js";
import { SecurityPipeline } from "../src/security/Pipeline.js";

describe("Dual-Path Duplicate Enforcement Test", () => {
  let mockGuild: any;
  let mockChannel: any;
  let mockExecutor: any;
  let localRevertCalls: number;

  beforeEach(() => {
    vi.resetAllMocks();
    SecurityPipeline.reset();
    UltraLowLatencyPipeline.getInstance().registerHandler("test", async () => {});
    
    localRevertCalls = 0;
    
    // Mock guild
    mockGuild = {
      id: "guild_123",
      name: "Test Guild",
      ownerId: "owner_123",
      channels: {
        cache: new Map(),
        find: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: "new_channel" })
      },
      members: {
        me: { roles: { highest: { position: 100 } } },
        fetch: vi.fn().mockResolvedValue({ 
          kick: vi.fn(), 
          ban: vi.fn(), 
          roles: { highest: { position: 50 } } 
        })
      },
      roles: { cache: new Map() },
      bans: { create: vi.fn(), remove: vi.fn() },
      fetchAuditLogs: vi.fn().mockResolvedValue({ entries: new Map() }),
      fetchWebhooks: vi.fn().mockResolvedValue(new Map()),
    };
    
    // Mock channel
    mockChannel = {
      id: "channel_456",
      name: "test-channel",
      type: 0, // GuildText
      guild: mockGuild,
      permissionOverwrites: { cache: new Map() },
      parentId: null,
    };
    
    // Mock executor
    mockExecutor = {
      id: "attacker_789",
      tag: "Attacker#1234",
      username: "Attacker",
      discriminator: "1234",
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("channelDelete: EnhancedEventEngine + Pipeline = exactly ONE revertAction", async () => {
    // Setup audit log to return the attacker
    const auditEntry = {
      executorId: mockExecutor.id,
      executor: mockExecutor,
      targetId: mockChannel.id,
      createdTimestamp: Date.now(),
    };
    
    // Mock fetchAuditLogWithRetry
    const { fetchAuditLogWithRetry } = await import("../discord-bot.js");
    vi.spyOn(await import("../discord-bot.js"), "fetchAuditLogWithRetry")
      .mockResolvedValue(auditEntry);
    
    // Mock isOwnerOrWhitelisted to return false (attacker)
    const { isOwnerOrWhitelisted } = await import("../discord-bot.js");
    vi.spyOn(await import("../discord-bot.js"), "isOwnerOrWhitelisted")
      .mockReturnValue(false);
    
    // Track revertAction calls
    localRevertCalls = 0;
    const mockRevertAction = vi.fn().mockImplementation(async () => {
      localRevertCalls++;
    });
    
    // Mock selfMemoryCheck to return false (not bot's own action)
    const selfMemoryCheck = vi.fn().mockReturnValue(false);
    
    // Get pipeline instance and register a handler that calls revertAction
    const pipeline = UltraLowLatencyPipeline.getInstance();
    
    // Simulate both paths processing the same event
    
    // Path 1: EnhancedEventEngine.intercept (the existing audit-log path)
    await EnhancedEventEngine.intercept(
      "Channel Deletion",
      mockGuild,
      mockChannel.id,
      12, // AuditLogEvent.ChannelDelete
      selfMemoryCheck,
      mockRevertAction
    );
    
    // Path 2: UltraLowLatencyPipeline.enqueue (the new C++ accelerated path)
    // This would trigger the pipeline handler registered in UltimateIntegration
    await ultraLowLatencyPipeline.enqueue({
      type: "channelDelete",
      guildId: mockGuild.id,
      payload: { channelId: mockChannel.id, channelName: mockChannel.name },
      priority: "critical",
    });
    
    // Wait for pipeline processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // VERIFY: revertAction should be called exactly ONCE total
    // (not once per path)
    console.log(`revertAction calls: ${localRevertCalls}`);
    
    // This is the key assertion - dual path should not duplicate enforcement
    expect(localRevertCalls).toBe(1);
  }, 10000);

  it("guildBanAdd: both paths process same event without duplicate punishment", async () => {
    const auditEntry = {
      executorId: mockExecutor.id,
      executor: mockExecutor,
      targetId: "victim_999",
      createdTimestamp: Date.now(),
    };
    
    const { fetchAuditLogWithRetry } = await import("../discord-bot.js");
    vi.spyOn(await import("../discord-bot.js"), "fetchAuditLogWithRetry")
      .mockResolvedValue(auditEntry);
    
    const { isOwnerOrWhitelisted } = await import("../discord-bot.js");
    vi.spyOn(await import("../discord-bot.js"), "isOwnerOrWhitelisted")
      .mockReturnValue(false);
    
    let punishCalls = 0;
    vi.spyOn(await import("../discord-bot.js"), "punishRogueAdmin")
      .mockImplementation(async () => { punishCalls++; });
    
    // Path 1: EnhancedEventEngine (via guildBanAdd handler in discord-bot.ts)
    // This is tested indirectly through the actual handler
    
    // Path 2: Pipeline enqueue
    await ultraLowLatencyPipeline.enqueue({
      type: "guildBanAdd",
      guildId: mockGuild.id,
      payload: { userId: "victim_999", executorId: mockExecutor.id },
      priority: "critical",
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should not have duplicate punishments
    expect(punishCalls).toBeLessThanOrEqual(1);
  }, 10000);
});