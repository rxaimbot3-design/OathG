/**
 * BehaviorScoring - Per-user risk scoring system.
 * Instance-based implementation for use with GuildContext.
 */

import type { SecurityModule } from "../core/interfaces/SecurityModule";

export interface RiskEntry {
  score: number;
  reasons: string[];
  lastUpdated: number;
}

export class BehaviorScoringInstance implements SecurityModule {
  readonly name = "behaviorScoring";
  private userScores = new Map<string, RiskEntry>();
  private maxScore = 100;
  private maxEntries = 5000;

  init(): void {
    // Nothing to initialize
  }

  addRisk(userId: string, points: number, reason: string): void {
    const existing = this.userScores.get(userId);
    const now = Date.now();

    if (existing) {
      existing.score = Math.min(this.maxScore, existing.score + points);
      existing.reasons.push(reason);
      existing.lastUpdated = now;
    } else {
      this.userScores.set(userId, {
        score: Math.min(this.maxScore, points),
        reasons: [reason],
        lastUpdated: now
      });
    }

    // Enforce max entries
    if (this.userScores.size > this.maxEntries) {
      const oldest = Array.from(this.userScores.entries())
        .sort((a, b) => a[1].lastUpdated - b[1].lastUpdated)
        .slice(0, 1000);
      for (const [id] of oldest) {
        this.userScores.delete(id);
      }
    }
  }

  getUserScore(userId: string): number {
    return this.userScores.get(userId)?.score ?? 0;
  }

  getUserReasons(userId: string): string[] {
    return this.userScores.get(userId)?.reasons ?? [];
  }

  reduceRisk(userId: string, points: number): void {
    const existing = this.userScores.get(userId);
    if (existing) {
      existing.score = Math.max(0, existing.score - points);
      existing.lastUpdated = Date.now();
    }
  }

  reset(userId: string): void {
    this.userScores.delete(userId);
  }

  getAllScores(): Map<string, number> {
    const scores = new Map<string, number>();
    for (const [userId, entry] of this.userScores) {
      scores.set(userId, entry.score);
    }
    return scores;
  }
}

/**
 * Global singleton instance (backwards compatibility).
 * @deprecated Use GuildContext.getBehaviorScoring() instead.
 */
export const BehaviorScoring = new BehaviorScoringInstance();
