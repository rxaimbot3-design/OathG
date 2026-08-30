/**
 * BehaviorScoring - Persistent user risk scoring with Redis
 * 
 * Features:
 * - Per-user risk scores with reasons
 * - Redis persistence with in-memory fallback
 * - Automatic decay of scores over time
 * - High-risk user detection
 * - Configurable thresholds
 */

import { TtlMap } from "../MapManager.js";
import { RedisPersistence } from "./redis-persistence.js";

export interface UserRiskData {
  score: number;
  reasons: string[];
  lastUpdated: number;
  decayedAt?: number;
}

export interface BehaviorScoringConfig {
  maxEntries?: number;
  ttlMs?: number;
  autoCleanupMs?: number;
  warningThreshold?: number;
  decayPointsPerHour?: number;
  keyPrefix?: string;
}

export class BehaviorScoring {
  private static instance: BehaviorScoring;
  private userRiskScores: TtlMap<string, UserRiskData>;
  private config: Required<BehaviorScoringConfig>;
  private persistence: RedisPersistence;
  private initialized = false;
  private decayInterval: NodeJS.Timeout | null = null;

  private constructor(config: BehaviorScoringConfig = {}) {
    this.config = {
      maxEntries: config.maxEntries ?? 50000,
      ttlMs: config.ttlMs ?? 7 * 24 * 60 * 60 * 1000, // 7 days
      autoCleanupMs: config.autoCleanupMs ?? 60000,
      warningThreshold: config.warningThreshold ?? 40000,
      decayPointsPerHour: config.decayPointsPerHour ?? 1,
      keyPrefix: config.keyPrefix ?? "behavior:",
    };
    this.userRiskScores = new TtlMap<string, UserRiskData>({
      ttlMs: this.config.ttlMs,
      maxEntries: this.config.maxEntries,
      autoCleanupMs: this.config.autoCleanupMs,
    });
    this.persistence = RedisPersistence.getInstance();
  }

  static getInstance(config?: BehaviorScoringConfig): BehaviorScoring {
    if (!BehaviorScoring.instance) {
      BehaviorScoring.instance = new BehaviorScoring(config);
    }
    return BehaviorScoring.instance;
  }

  static resetInstance(): void {
    if (BehaviorScoring.instance) {
      BehaviorScoring.instance.cleanup();
    }
    BehaviorScoring.instance = undefined as any;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.persistence.connect();
    await this.loadFromPersistence();
    this.startDecayTimer();
    this.initialized = true;
  }

  private async loadFromPersistence(): Promise<void> {
    try {
      const keys = await this.persistence.keys(`${this.config.keyPrefix}*`);
      for (const key of keys) {
        const data = await this.persistence.get<UserRiskData>(key);
        if (data) {
          const userId = key.replace(this.config.keyPrefix, "");
          this.userRiskScores.set(userId, data);
        }
      }
      console.log(`[BehaviorScoring] Loaded ${this.userRiskScores.size} user risk profiles from Redis`);
    } catch (err) {
      console.warn("[BehaviorScoring] Failed to load from persistence:", (err as Error).message);
    }
  }

  private async persistUser(userId: string, data: UserRiskData): Promise<void> {
    try {
      await this.persistence.set(`${this.config.keyPrefix}${userId}`, data, this.config.ttlMs);
    } catch (err) {
      console.warn("[BehaviorScoring] Failed to persist user:", (err as Error).message);
    }
  }

  private startDecayTimer(): void {
    if (this.decayInterval) return;
    this.decayInterval = setInterval(async () => {
      await this.decayScores();
    }, 60 * 60 * 1000); // Every hour
  }

  private async decayScores(): Promise<void> {
    const decayAmount = this.config.decayPointsPerHour;
    for (const [userId, data] of this.userRiskScores.entries()) {
      if (data.score > 0) {
        const newScore = Math.max(0, data.score - decayAmount);
        if (newScore !== data.score) {
          data.score = newScore;
          data.decayedAt = Date.now();
          await this.persistUser(userId, data);
        }
      }
    }
  }

  getRisk(userId: string): UserRiskData {
    return this.userRiskScores.get(userId) || { score: 10, reasons: ["New/Normal User"], lastUpdated: Date.now() };
  }

  getScore(userId: string): number {
    return this.getRisk(userId).score;
  }

  async recordViolation(userId: string, reason = "Behavioral Violation"): Promise<number> {
    return this.addRisk(userId, 15, reason);
  }

  async addRisk(userId: string, points: number, reason: string): Promise<number> {
    if (!this.initialized) await this.initialize();
    const current = this.getRisk(userId);
    const newScore = Math.min(100, Math.max(0, current.score + points));
    const reasons = [reason, ...current.reasons.filter((r: string) => r !== reason)].slice(0, 10);
    const data: UserRiskData = { score: newScore, reasons, lastUpdated: Date.now() };
    this.userRiskScores.set(userId, data);
    await this.persistUser(userId, data);

    if (this.userRiskScores.size > this.config.warningThreshold) {
      console.warn(`⚠️ [BEHAVIOR SCORE] Map size approaching limit: ${this.userRiskScores.size}/${this.config.maxEntries}`);
    }
    console.log(`⚠️ [BEHAVIOR SCORE] User ${userId} risk updated: ${newScore}/100 (${reason})`);
    return newScore;
  }

  async reduceRisk(userId: string, points: number, reason = "Good behavior"): Promise<number> {
    if (!this.initialized) await this.initialize();
    const current = this.getRisk(userId);
    const newScore = Math.max(0, current.score - points);
    const reasons = [reason, ...current.reasons.filter((r: string) => r !== reason)].slice(0, 10);
    const data: UserRiskData = { score: newScore, reasons, lastUpdated: Date.now() };
    this.userRiskScores.set(userId, data);
    await this.persistUser(userId, data);
    return newScore;
  }

  async setRisk(userId: string, score: number, reason = "Manual override"): Promise<number> {
    if (!this.initialized) await this.initialize();
    const newScore = Math.min(100, Math.max(0, score));
    const data: UserRiskData = { score: newScore, reasons: [reason], lastUpdated: Date.now() };
    this.userRiskScores.set(userId, data);
    await this.persistUser(userId, data);
    return newScore;
  }

  async getAllHighRiskUsers(threshold = 50): Promise<Array<{ userId: string; score: number; reasons: string[] }>> {
    const highRisk: Array<{ userId: string; score: number; reasons: string[] }> = [];
    this.userRiskScores.forEach((data, userId) => {
      if (data.score >= threshold) {
        highRisk.push({ userId, score: data.score, reasons: data.reasons });
      }
    });
    return highRisk.sort((a, b) => b.score - a.score);
  }

  async getAllUsers(): Promise<Array<{ userId: string; score: number; reasons: string[] }>> {
    const all: Array<{ userId: string; score: number; reasons: string[] }> = [];
    this.userRiskScores.forEach((data, userId) => {
      all.push({ userId, score: data.score, reasons: data.reasons });
    });
    return all.sort((a, b) => b.score - a.score);
  }

  getStats() {
    // getAllHighRiskUsers is async, so we can't use it synchronously in getStats
    // Return a simplified stats object without the async call
    return {
      totalUsers: this.userRiskScores.size,
      highRiskCount: -1, // -1 indicates async-only
      maxEntries: this.config.maxEntries,
      redisConnected: this.persistence.getConnectionStatus().connected,
    };
  }

  async clear(): Promise<void> {
    this.userRiskScores.clear();
    const keys = await this.persistence.keys(`${this.config.keyPrefix}*`);
    for (const key of keys) {
      await this.persistence.del(key);
    }
  }

  private cleanup(): void {
    if (this.decayInterval) {
      clearInterval(this.decayInterval);
      this.decayInterval = null;
    }
    this.userRiskScores.clear();
  }

  // Static wrapper methods for backward compatibility
  static getRisk(userId: string): UserRiskData {
    return this.getInstance().getRisk(userId);
  }

  static getScore(userId: string): number {
    return this.getInstance().getScore(userId);
  }

  static async recordViolation(userId: string, reason = "Behavioral Violation"): Promise<number> {
    return this.getInstance().addRisk(userId, 15, reason);
  }

  static async addRisk(userId: string, points: number, reason: string): Promise<number> {
    return this.getInstance().addRisk(userId, points, reason);
  }

  static async reduceRisk(userId: string, points: number, reason = "Good behavior"): Promise<number> {
    return this.getInstance().reduceRisk(userId, points, reason);
  }

  static async setRisk(userId: string, score: number, reason = "Manual override"): Promise<number> {
    return this.getInstance().setRisk(userId, score, reason);
  }

  static async getAllHighRiskUsers(threshold = 50): Promise<Array<{ userId: string; score: number; reasons: string[] }>> {
    return this.getInstance().getAllHighRiskUsers(threshold);
  }

  static getStats() {
    return this.getInstance().getStats();
  }

  static async clear(): Promise<void> {
    return this.getInstance().clear();
  }
}