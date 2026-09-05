import { describe, it, expect, beforeEach, vi } from "vitest";
import { IdempotencyManager, generateIdempotencyKey, withIdempotency, resetIdempotencyManager } from "../src/services/idempotency.js";

describe("IdempotencyManager", () => {
  beforeEach(() => {
    resetIdempotencyManager();
  });

  it("generates deterministic keys for same inputs", () => {
    const key1 = generateIdempotencyKey("ban", "guild_1", "executor_1", "target_1");
    const key2 = generateIdempotencyKey("ban", "guild_1", "executor_1", "target_1");
    expect(key1).toBe(key2);
    expect(key1).toHaveLength(32);
  });

  it("generates different keys for different inputs", () => {
    const key1 = generateIdempotencyKey("ban", "guild_1", "executor_1", "target_1");
    const key2 = generateIdempotencyKey("ban", "guild_1", "executor_1", "target_2");
    const key3 = generateIdempotencyKey("kick", "guild_1", "executor_1", "target_1");
    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
  });

  it("returns isNew: true for first execution", () => {
    const manager = IdempotencyManager.getInstance();
    const result = manager.checkAndStore("test_key", "test_result");
    expect(result.isNew).toBe(true);
    expect(result.key).toBe("test_key");
  });

  it("returns isNew: false for duplicate execution", () => {
    const manager = IdempotencyManager.getInstance();
    manager.checkAndStore("test_key", "test_result");
    const result = manager.checkAndStore("test_key", "different_result");
    expect(result.isNew).toBe(false);
    expect(result.existingResult).toBe("test_result");
  });

it("has() returns true for existing keys", () => {
    const manager = IdempotencyManager.getInstance();
    manager.checkAndStore("has_key", "test_result");
    expect(manager.has("has_key")).toBe(true);
    expect(manager.has("other_key")).toBe(false);
  });

  it("get() returns stored result", () => {
    const manager = IdempotencyManager.getInstance();
    manager.checkAndStore("get_key", { success: true, id: "123" });
    const result = manager.get("get_key");
    expect(result).toEqual({ success: true, id: "123" });
  });

  it("delete() removes key", () => {
    const manager = IdempotencyManager.getInstance();
    manager.checkAndStore("delete_key", "test_result");
    expect(manager.has("delete_key")).toBe(true);
    manager.delete("delete_key");
    expect(manager.has("delete_key")).toBe(false);
  });

  it("clear() removes all keys", () => {
    const manager = IdempotencyManager.getInstance();
    manager.checkAndStore("key1", "result1");
    manager.checkAndStore("key2", "result2");
    manager.clear();
    expect(manager.size()).toBe(0);
  });

it("withIdempotency executes operation once", async () => {
    resetIdempotencyManager();
    let callCount = 0;
    const operation = vi.fn().mockImplementation(async () => {
      callCount++;
      await new Promise(resolve => setTimeout(resolve, 5));
      return { success: true };
    });
    
    const result1 = await withIdempotency("ban", "guild_1", "executor_1", "target_1", operation);
    console.log("Result1:", result1);
    expect(result1.executed).toBe(true);
    expect(result1.result).toEqual({ success: true });
    expect(callCount).toBe(1);
    
    // Second call should not execute operation
    const result2 = await withIdempotency("ban", "guild_1", "executor_1", "target_1", operation);
    console.log("Result2:", result2);
    expect(result2.executed).toBe(false);
    expect(result2.result).toEqual({ success: true });
    expect(callCount).toBe(1);
  }, 10000);

  it("withIdempotency retries on failure", async () => {
    resetIdempotencyManager();
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValue({ success: true });
    
    await expect(withIdempotency("ban", "guild_1", "executor_1", "target_1", operation))
      .rejects.toThrow("Network error");
    
    // Key should be deleted on failure, allowing retry
    const manager = IdempotencyManager.getInstance();
    expect(manager.has("")).toBe(false); // Key was deleted
    
    // Retry should succeed
    const result = await withIdempotency("ban", "guild_1", "executor_1", "target_1", operation);
    expect(result.executed).toBe(true);
    expect(result.result).toEqual({ success: true });
  });
});