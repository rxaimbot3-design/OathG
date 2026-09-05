/**
 * Idempotency Key Manager
 * Ensures destructive actions are not executed multiple times for the same event
 */

import { TtlMap } from "../security/MapManager.js";
import { createHash } from "crypto";

export interface IdempotencyConfig {
  ttlMs?: number;
  maxEntries?: number;
}

export interface IdempotencyResult {
  isNew: boolean;
  key: string;
  existingResult?: any;
}

/**
 * Generate a deterministic idempotency key from action parameters
 */
export function generateIdempotencyKey(
  actionType: string,
  guildId: string,
  executorId: string,
  targetId: string,
  additionalData?: Record<string, any>
): string {
  const data = JSON.stringify({
    actionType,
    guildId,
    executorId,
    targetId,
    ...additionalData,
  });
  return createHash("sha256").update(data).digest("hex").substring(0, 32);
}

export class IdempotencyManager {
  private static instance: IdempotencyManager;
  protected store: TtlMap<string, { result: any; timestamp: number }>;
  protected pending: Map<string, Promise<any>> = new Map();

  public constructor(config: IdempotencyConfig = {}) {
    this.store = new TtlMap<string, { result: any; timestamp: number }>({
      ttlMs: config.ttlMs ?? 24 * 60 * 60 * 1000, // 24 hours default
      maxEntries: config.maxEntries ?? 10000,
      autoCleanupMs: 60 * 60 * 1000, // 1 hour
    });
  }

  static getInstance(config?: IdempotencyConfig): IdempotencyManager {
    if (!IdempotencyManager.instance) {
      IdempotencyManager.instance = new IdempotencyManager(config);
    }
    return IdempotencyManager.instance;
  }

  static resetInstance(): void {
    IdempotencyManager.instance = undefined as any;
  }

  /**
   * Check if an action has already been executed, and store the result if new
   * Returns { isNew: true } if this is the first time, { isNew: false, existingResult } if duplicate
   */
  checkAndStore(key: string, result: any): IdempotencyResult {
    const existing = this.store.get(key);
    if (existing) {
      return {
        isNew: false,
        key,
        existingResult: existing.result,
      };
    }

    this.store.set(key, { result, timestamp: Date.now() });
    return { isNew: true, key };
  }

  /**
   * Check if an action has already been executed without storing a new result
   */
  has(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * Get the stored result for a key
   */
  get(key: string): any | undefined {
    const entry = this.store.get(key);
    return entry?.result;
  }

  /**
   * Delete an idempotency key (e.g., for testing or manual override)
   */
  delete(key: string): boolean {
    this.store.delete(key);
    this.pending.delete(key);
    return true;
  }

  /**
   * Clear all idempotency keys
   */
  clear(): void {
    this.store.clear();
    this.pending.clear();
  }

  /**
   * Get current store size
   */
size(): number {
    return this.store.size;
  }

/**
   * Wait for a result to be stored (when PENDING but no pending promise)
   */
  async waitForResult<T>(key: string): Promise<{ executed: boolean; result: T | undefined }> {
    const maxWaitMs = 30000;
    const pollIntervalMs = 50;
    const startTime = Date.now();
    
    while (Date.now() - startTime < 30000) {
      const result = this.get(key);
      if (result !== undefined && result !== "PENDING") {
        return { executed: false, result };
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    return { executed: false, result: undefined };
  }

  /**
   * Get pending promise for a key
   */
  getPending(key: string): Promise<any> | undefined {
    return this.pending.get(key);
  }

  /**
   * Register a pending operation for a key
   */
  setPending(key: string, promise: Promise<any>): void {
    this.pending.set(key, promise);
  }

  /**
   * Delete a pending promise
   */
  deletePending(key: string): void {
    this.pending.delete(key);
  }

  /**
   * Set a value in the store directly (for overwriting PENDING with result)
   */
  setStore(key: string, value: any): void {
    this.store.set(key, { result: value, timestamp: Date.now() });
  }
}

// Singleton instance getter for backward compatibility
let idempotencyManagerInstance: IdempotencyManager | null = null;

export function getIdempotencyManager(config?: IdempotencyConfig): IdempotencyManager {
  if (!idempotencyManagerInstance) {
    idempotencyManagerInstance = new IdempotencyManager(config);
  }
  return idempotencyManagerInstance;
}

export function resetIdempotencyManager(): void {
  if (idempotencyManagerInstance) {
    idempotencyManagerInstance.clear();
    idempotencyManagerInstance = null;
  }
}

/**
 * Wrapper for executing a destructive action with idempotency guarantee
 * Uses Promise-based waiting instead of polling for better performance
 */
export async function withIdempotency<T>(
  actionType: string,
  guildId: string,
  executorId: string,
  targetId: string,
  operation: () => Promise<T>,
  additionalData?: Record<string, any>
): Promise<{ executed: boolean; result: T | undefined }> {
  const manager = getIdempotencyManager();
  const key = generateIdempotencyKey(actionType, guildId, executorId, targetId, additionalData);
  
  // Check if already completed
  const existing = manager.get(key);
  if (existing !== undefined && existing !== "PENDING") {
    return { executed: false, result: existing };
  }

  // If PENDING, check for pending promise
  if (existing === "PENDING") {
    const pendingPromise = manager.getPending(key);
    if (pendingPromise) {
      try {
        const result = await pendingPromise;
        return { executed: false, result };
      } catch {
        // Pending operation failed, fall through to execute ourselves
      }
    }
    // PENDING but no pending promise - wait for result to be stored
    return manager.waitForResult(key);
  }

  // Check if there's a pending operation for this key
  const pendingPromise = manager.getPending(key);
  if (pendingPromise) {
    try {
      const result = await pendingPromise;
      return { executed: false, result };
    } catch {
      // Pending operation failed, fall through to execute ourselves
    }
  }

  // Try to claim this execution
  const check = manager.checkAndStore(key, "PENDING" as any);
  
  if (!check.isNew) {
    // Another execution already claimed it - wait for it
    const newPendingPromise = manager.getPending(key);
    if (newPendingPromise) {
      try {
        const result = await newPendingPromise;
        return { executed: false, result };
      } catch {
        // Fall through to execute ourselves
      }
    }
  }

  // We claimed it - execute the operation
  let operationPromise: Promise<T>;
  try {
    operationPromise = operation();
    manager.setPending(key, operationPromise);
    const result = await operationPromise;
    // Store successful result (overwrite PENDING)
    manager.setStore(key, result);
    manager.deletePending(key);
    return { executed: true, result };
  } catch (error) {
    // On failure, remove the PENDING marker so it can be retried
    manager.delete(key);
    manager.deletePending(key);
    throw error;
  }
}