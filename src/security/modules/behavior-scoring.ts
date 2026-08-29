import { TtlMap } from "../MapManager.js";

export interface UserRiskData {
  score: number;
  reasons: string[];
  lastUpdated: number;
}

export interface BehaviorScoringConfig {
  maxEntries?: number;
  ttlMs?: number;
  autoCleanupMs?: number;
  warningThreshold?: number;
}

export class BehaviorScoring {
  private static instance: BehaviorScoring;
  private userRiskScores: TtlMap<string, UserRiskData>;
  private config: Required<BehaviorScoringConfig>;

  private constructor(config: BehaviorScoringConfig = {}) {
    this.config = {
      maxEntries: config.maxEntries ?? 5000,
      ttlMs: config.ttlMs ?? 60 * 60 * 1000,
      autoCleanupMs: config.autoCleanupMs ?? 60000,
      warningThreshold: config.warningThreshold ?? 4000,
    };
    this.userRiskScores = new TtlMap<string, UserRiskData>({
      ttlMs: this.config.ttlMs,
      maxEntries: this.config.maxEntries,
      autoCleanupMs: this.config.autoCleanupMs,
    });
  }

  static getInstance(config?: BehaviorScoringConfig): BehaviorScoring {
    if (!BehaviorScoring.instance) {
      BehaviorScoring.instance = new BehaviorScoring(config);
    }
    return BehaviorScoring.instance;
  }

  static resetInstance(): void {
    BehaviorScoring.instance = undefined as any;
  }

  getRisk(userId: string): UserRiskData {
    return this.userRiskScores.get(userId) || { score: 10, reasons: ["New/Normal User"], lastUpdated: Date.now() };
  }

  getScore(userId: string): number {
    return this.getRisk(userId).score;
  }

  recordViolation(userId: string, reason = "Behavioral Violation"): number {
    return this.addRisk(userId, 15, reason);
  }

  addRisk(userId: string, points: number, reason: string): number {
    const current = this.getRisk(userId);
    const newScore = Math.min(100, Math.max(0, current.score + points));
    const reasons = [reason, ...current.reasons.filter((r: any) => r !== reason)].slice(0, 5);
    this.userRiskScores.set(userId, { score: newScore, reasons, lastUpdated: Date.now() });
    if (this.userRiskScores.size > this.config.warningThreshold) {
      console.warn(`⚠️ [BEHAVIOR SCORE] Map size approaching limit: ${this.userRiskScores.size}/${this.config.maxEntries}`);
    }
    console.log(`⚠️ [BEHAVIOR SCORE] User ${userId} risk updated: ${newScore}/100 (${reason})`);
    return newScore;
  }

  reduceRisk(userId: string, points: number, reason = "Good behavior"): number {
    const current = this.getRisk(userId);
    const newScore = Math.max(0, current.score - points);
    const reasons = [reason, ...current.reasons.filter((r: any) => r !== reason)].slice(0, 5);
    this.userRiskScores.set(userId, { score: newScore, reasons, lastUpdated: Date.now() });
    return newScore;
  }

  setRisk(userId: string, score: number, reason = "Manual override"): number {
    const newScore = Math.min(100, Math.max(0, score));
    this.userRiskScores.set(userId, { score: newScore, reasons: [reason], lastUpdated: Date.now() });
    return newScore;
  }

  getAllHighRiskUsers(threshold = 50): Array<{ userId: string; score: number; reasons: string[] }> {
    const highRisk: Array<{ userId: string; score: number; reasons: string[] }> = [];
    this.userRiskScores.forEach((data, userId) => {
      if (data.score >= threshold) {
        highRisk.push({ userId, score: data.score, reasons: data.reasons });
      }
    });
    return highRisk.sort((a, b) => b.score - a.score);
  }

  getStats() {
    return {
      totalUsers: this.userRiskScores.size,
      highRiskCount: this.getAllHighRiskUsers().length,
      maxEntries: this.config.maxEntries,
    };
  }

  clear(): void {
    this.userRiskScores.clear();
  }

  // Static wrapper methods for backward compatibility
  static getRisk(userId: string): UserRiskData {
    return this.getInstance().getRisk(userId);
  }

  static getScore(userId: string): number {
    return this.getInstance().getScore(userId);
  }

  static recordViolation(userId: string, reason = "Behavioral Violation"): number {
    return this.getInstance().recordViolation(userId, reason);
  }

  static addRisk(userId: string, points: number, reason: string): number {
    return this.getInstance().addRisk(userId, points, reason);
  }

  static reduceRisk(userId: string, points: number, reason = "Good behavior"): number {
    return this.getInstance().reduceRisk(userId, points, reason);
  }

  static setRisk(userId: string, score: number, reason = "Manual override"): number {
    return this.getInstance().setRisk(userId, score, reason);
  }

  static getAllHighRiskUsers(threshold = 50): Array<{ userId: string; score: number; reasons: string[] }> {
    return this.getInstance().getAllHighRiskUsers(threshold);
  }

  static getStats() {
    return this.getInstance().getStats();
  }

  static clear(): void {
    return this.getInstance().clear();
  }
}