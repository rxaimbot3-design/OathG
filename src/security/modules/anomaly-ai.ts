import { TtlMap } from "../MapManager.js";

export type AnomalyLevel = "NORMAL" | "SUSPICIOUS_ACTIVITY" | "CRITICAL_NUKE_THREAT";

export interface AnomalyAIConfig {
  maxEntries?: number;
  ttlMs?: number;
  autoCleanupMs?: number;
}

export class AnomalyAI {
  private static instance: AnomalyAI;
  private actionHistory: TtlMap<string, number[]>;
  private config: Required<AnomalyAIConfig>;

  private constructor(config: AnomalyAIConfig = {}) {
    this.config = {
      maxEntries: config.maxEntries ?? 10000,
      ttlMs: config.ttlMs ?? 60 * 60 * 1000,
      autoCleanupMs: config.autoCleanupMs ?? 300000,
    };
    this.actionHistory = new TtlMap<string, number[]>({
      ttlMs: this.config.ttlMs,
      maxEntries: this.config.maxEntries,
      autoCleanupMs: this.config.autoCleanupMs,
    });
  }

  static getInstance(config?: AnomalyAIConfig): AnomalyAI {
    if (!AnomalyAI.instance) {
      AnomalyAI.instance = new AnomalyAI(config);
    }
    return AnomalyAI.instance;
  }

  static resetInstance(): void {
    AnomalyAI.instance = undefined as any;
  }

  recordAction(userId: string): void {
    const now = Date.now();
    const history = this.actionHistory.get(userId) || [];
    history.push(now);
    this.actionHistory.set(userId, history);
  }

  evaluateSpike(userId: string, actionCount: number, timeWindowSeconds: number): AnomalyLevel {
    const now = Date.now();
    const history = this.actionHistory.get(userId) || [];
    const recent = history.filter(t => now - t < timeWindowSeconds * 1000);

    if (recent.length === 0) return "NORMAL";

    const actionsPerSecond = recent.length / timeWindowSeconds;

    if (actionsPerSecond > 5) return "CRITICAL_NUKE_THREAT";
    if (actionsPerSecond > 2) return "SUSPICIOUS_ACTIVITY";
    return "NORMAL";
  }

  getActionCount(userId: string, timeWindowSeconds: number): number {
    const now = Date.now();
    const history = this.actionHistory.get(userId) || [];
    return history.filter(t => now - t < timeWindowSeconds * 1000).length;
  }

  clear(): void {
    this.actionHistory.clear();
  }

  // Static wrapper methods for backward compatibility
  static recordAction(userId: string): void {
    return this.getInstance().recordAction(userId);
  }

  static evaluateSpike(userId: string, actionCount: number, timeWindowSeconds: number): AnomalyLevel {
    return this.getInstance().evaluateSpike(userId, actionCount, timeWindowSeconds);
  }

  static getActionCount(userId: string, timeWindowSeconds: number): number {
    return this.getInstance().getActionCount(userId, timeWindowSeconds);
  }

  static clear(): void {
    return this.getInstance().clear();
  }
}