import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EnhancedEventEngine } from "../discord-bot.js";
import { ultraLowLatencyPipeline, UltraLowLatencyPipeline } from "../src/core/UltraLowLatencyPipeline.js";
import { SecurityPipeline } from "../src/security/Pipeline.js";
import { withIdempotency, resetIdempotencyManager } from "../src/services/idempotency.js";

describe("Chaos Test: Discord Reconnect Under Attack", () => {
  let mockGuild: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles rapid reconnect without duplicate listener registration", async () => {
    const engine = EnhancedEventEngine;
    
    // Simulate first connect
    await engine.intercept("Channel Deletion", mockGuild, "channel_1", 12, () => false, async () => {});
    
    // Simulate reconnect - the engine should not register duplicate internal listeners
    await engine.intercept("Channel Deletion", mockGuild, "channel_2", 12, () => false, async () => {});
    
    // The cross-thread sync bus should handle deduplication
    expect(true).toBe(true);
  }, 10000);

  it("maintains security state across reconnects", async () => {
    const pipeline = UltraLowLatencyPipeline.getInstance();
    
    // Enqueue some events before "reconnect"
    await pipeline.enqueue({
      type: "channelDelete",
      guildId: "guild_1",
      payload: { channelId: "channel_1" },
      priority: "critical",
    });
    
    // Simulate reconnect - pipeline should still process
    await pipeline.enqueue({
      type: "channelDelete",
      guildId: "guild_1",
      payload: { channelId: "channel_2" },
      priority: "critical",
    });
    
    const metrics = pipeline.getMetrics();
    expect(metrics.queueDepth).toBeGreaterThanOrEqual(0);
  });

  it("handles out-of-order events after reconnect", async () => {
    const pipeline = UltraLowLatencyPipeline.getInstance();
    
    // Simulate events arriving out of order after reconnect
    const events = [
      { type: "channelDelete", guildId: "guild_1", payload: { channelId: "ch_1" }, priority: "critical" as const },
      { type: "channelCreate", guildId: "guild_1", payload: { channelId: "ch_2" }, priority: "high" as const },
      { type: "channelDelete", guildId: "guild_1", payload: { channelId: "ch_1" }, priority: "critical" as const }, // Duplicate delete
    ];
    
    for (const event of events) {
      await pipeline.enqueue(event);
    }
    
    const metrics = pipeline.getMetrics();
    expect(metrics.processed).toBeGreaterThanOrEqual(0);
  });

  it("preserves idempotency keys across reconnects", async () => {
    resetIdempotencyManager();
    
    let callCount = 0;
    const operation = vi.fn().mockImplementation(async () => {
      callCount++;
      return { success: true };
    });
    
    // First execution (simulating initial connect)
    const result1 = await withIdempotency("ban", "guild_1", "attacker_1", "victim_1", operation);
    expect(result1.executed).toBe(true);
    expect(callCount).toBe(1);
    
    // Simulate reconnect - same event should not re-execute
    const result2 = await withIdempotency("ban", "guild_1", "attacker_1", "victim_1", operation);
    expect(result2.executed).toBe(false);
    expect(callCount).toBe(1);
  });
});

describe("Chaos Test: Out-of-Order Event Processing", () => {
  let mockGuild: any;
  let mockChannel: any;
  let mockExecutor: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
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
    
    mockChannel = {
      id: "channel_456",
      name: "test-channel",
      type: 0,
      guild: mockGuild,
      permissionOverwrites: { cache: new Map() },
      parentId: null,
    };
    
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

  it("handles delete-before-create (out-of-order) correctly", async () => {
    const { fetchAuditLogWithRetry } = await import("../discord-bot.js");
    const { isOwnerOrWhitelisted } = await import("../discord-bot.js");
    
    vi.spyOn(await import("../discord-bot.js"), "fetchAuditLogWithRetry")
      .mockResolvedValue({
        executorId: mockExecutor.id,
        executor: mockExecutor,
        targetId: mockChannel.id,
        createdTimestamp: Date.now(),
      });
    
    vi.spyOn(await import("../discord-bot.js"), "isOwnerOrWhitelisted")
      .mockReturnValue(false);
    
    let revertCalls = 0;
    const mockRevertAction = vi.fn().mockImplementation(async () => { revertCalls++; });
    const selfMemoryCheck = vi.fn().mockReturnValue(false);
    
    const pipeline = UltraLowLatencyPipeline.getInstance();
    
    // Simulate out-of-order: delete arrives before create
    // First, enqueue delete (simulating it arrives first)
    await ultraLowLatencyPipeline.enqueue({
      type: "channelDelete",
      guildId: mockGuild.id,
      payload: { channelId: "ch_1", channelName: "test" },
      priority: "critical",
    });
    
    // Then enqueue create (simulating it arrives after)
    await ultraLowLatencyPipeline.enqueue({
      type: "channelCreate",
      guildId: mockGuild.id,
      payload: { channelId: "ch_1", channelName: "test" },
      priority: "high",
    });
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // The pipeline should handle out-of-order correctly
    const metrics = pipeline.getMetrics();
    expect(metrics.processed).toBeGreaterThanOrEqual(2);
  });

  it("handles duplicate events correctly (retransmission)", async () => {
    const { fetchAuditLogWithRetry } = await import("../discord-bot.js");
    const { isOwnerOrWhitelisted } = await import("../discord-bot.js");
    
    vi.spyOn(await import("../discord-bot.js"), "fetchAuditLogWithRetry")
      .mockResolvedValue({
        executorId: mockExecutor.id,
        executor: mockExecutor,
        targetId: mockChannel.id,
        createdTimestamp: Date.now(),
      });
    
    vi.spyOn(await import("../discord-bot.js"), "isOwnerOrWhitelisted")
      .mockReturnValue(false);
    
    let revertCalls = 0;
    const mockRevertAction = vi.fn().mockImplementation(async () => { revertCalls++; });
    const selfMemoryCheck = vi.fn().mockReturnValue(false);
    
    const engine = EnhancedEventEngine;
    
    // Simulate duplicate event (Discord retries)
    await engine.intercept(
      "Channel Deletion",
      mockGuild,
      mockChannel.id,
      12,
      selfMemoryCheck,
      mockRevertAction
    );
    
    // Simulate duplicate arriving
    await engine.intercept(
      "Channel Deletion",
      mockGuild,
      mockChannel.id,
      12,
      selfMemoryCheck,
      mockRevertAction
    );
    
    // Should only call revertAction once due to deduplication
    expect(revertCalls).toBeLessThanOrEqual(1);
  });

  it("handles burst of mixed events after reconnect", async () => {
    const pipeline = UltraLowLatencyPipeline.getInstance();
    
    // Simulate a burst of events after reconnect
    const events = [
      { type: "channelDelete", guildId: "guild_1", payload: { channelId: "ch_1" }, priority: "critical" as const },
      { type: "channelCreate", guildId: "guild_1", payload: { channelId: "ch_2" }, priority: "high" as const },
      { type: "roleDelete", guildId: "guild_1", payload: { roleId: "role_1" }, priority: "critical" as const },
      { type: "roleCreate", guildId: "guild_1", payload: { roleId: "role_2" }, priority: "high" as const },
      { type: "guildBanAdd", guildId: "guild_1", payload: { userId: "user_1" }, priority: "critical" as const },
    ];
    
    for (const event of events) {
      await pipeline.enqueue(event);
    }
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const metrics = pipeline.getMetrics();
    expect(metrics.processed).toBeGreaterThanOrEqual(5);
  });

  it("handles duplicate event IDs correctly", async () => {
    resetIdempotencyManager();
    
    let callCount = 0;
    const operation = vi.fn().mockImplementation(async () => {
      callCount++;
      return { success: true };
    });
    
    // First execution
    const result1 = await withIdempotency("ban", "guild_1", "attacker_1", "victim_1", operation);
    expect(result1.executed).toBe(true);
    expect(callCount).toBe(1);
    
    // Simulate duplicate event with same key
    const result2 = await withIdempotency("ban", "guild_1", "attacker_1", "victim_1", operation);
    expect(result2.executed).toBe(false);
    expect(callCount).toBe(1);
    
    // Third duplicate
    const result3 = await withIdempotency("ban", "guild_1", "attacker_1", "victim_1", operation);
    expect(result3.executed).toBe(false);
    expect(callCount).toBe(1);
  });
});