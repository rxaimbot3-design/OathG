import { describe, it, expect, beforeEach, vi } from "vitest";
import { RateLimiter } from "../src/SecurityFeatures.js";
import { SecurityPipeline, SecurityEvent } from "../src/security/Pipeline.js";

describe("SecurityFeatures: RateLimiter", () => {
  beforeEach(() => {
    SecurityPipeline.reset();
    RateLimiter.resetInstance();
  });

  it("allows requests under limit", async () => {
    const limiter = RateLimiter.getInstance({ redisEnabled: false, maxRequests: 5, windowMs: 10000 });
    for (let i = 0; i < 4; i++) {
      expect((await limiter.check("user_1")).allowed).toBe(true);
    }
  });

  it("blocks requests over limit", async () => {
    const limiter = RateLimiter.getInstance({ redisEnabled: false, maxRequests: 5, windowMs: 10000 });
    for (let i = 0; i < 5; i++) {
      await limiter.check("user_1");
    }
    expect((await limiter.check("user_1")).allowed).toBe(false);
  });

  it("tracks separate limits per key", async () => {
    const limiter = RateLimiter.getInstance({ redisEnabled: false, maxRequests: 5, windowMs: 10000 });
    for (let i = 0; i < 5; i++) {
      await limiter.check("user_1");
    }
    expect((await limiter.check("user_1")).allowed).toBe(false);
    expect((await limiter.check("user_2")).allowed).toBe(true);
  });
});

describe("SecurityFeatures: SecurityPipeline Edge Cases", () => {
  beforeEach(() => {
    SecurityPipeline.reset();
  });

  it("handles empty batch without errors", () => {
    const results = SecurityPipeline.processBatch([]);
    expect(results).toEqual([]);
  });

  it("handles events with missing payload", () => {
    const event = {
      type: "message_create" as const,
      userId: "user_1",
      guildId: "guild_1",
      timestamp: Date.now(),
      payload: undefined
    } as unknown as SecurityEvent;
    const result = SecurityPipeline.processEvent(event);
    // Missing payload should be treated as empty object and not block benign events
    expect(result.blocked).toBe(false);
    expect(result.action).toBe("monitor");
    expect(result.score).toBeLessThan(50);
  });

  it("handles events with null userId", () => {
    const event = {
      type: "message_create" as const,
      userId: null as any,
      guildId: "guild_1",
      timestamp: Date.now(),
      payload: {}
    };
    const result = SecurityPipeline.processEvent(event);
    // null userId is invalid input and must be blocked
    expect(result.blocked).toBe(true);
    expect(result.rule).toBe("invalid_input");
    expect(result.score).toBeGreaterThanOrEqual(50);
  });

  it("handles events with null guildId", () => {
    const event = {
      type: "message_create" as const,
      userId: "user_1",
      guildId: null as any,
      timestamp: Date.now(),
      payload: {}
    };
    const result = SecurityPipeline.processEvent(event);
    // null guildId is invalid input and must be blocked
    expect(result.blocked).toBe(true);
    expect(result.rule).toBe("invalid_input");
    expect(result.score).toBeGreaterThanOrEqual(50);
  });

  it("clamps invalid timestamps to Date.now()", () => {
    const event = {
      type: "message_create" as const,
      userId: "user_1",
      guildId: "guild_1",
      timestamp: -1,
      payload: {}
    };
    const result = SecurityPipeline.processEvent(event);
    // Invalid timestamp should be clamped and treated as a normal recent event
    expect(result.blocked).toBe(false);
    expect(result.action).toBe("monitor");
    expect(result.score).toBeLessThan(50);
  });
});
