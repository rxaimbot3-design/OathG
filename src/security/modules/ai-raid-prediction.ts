export interface RaidPredictionResult {
  predictedRaidProbability: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  timeToImpactSeconds: number;
  factors: string[];
  recommendation: string;
}

export interface HistoricalBaseline {
  avgJoinsPerMinute: number;
  p95JoinsPerMinute: number;
  maxJoinsPerMinute: number;
  avgFreshAccountRatio: number;
  p95FreshAccountRatio: number;
}

export interface AIRaidPredictionConfig {
  baseline?: Partial<HistoricalBaseline>;
  maxHistorySize?: number;
}

export class AIRaidPrediction {
  private static instance: AIRaidPrediction;
  private joinTimes: number[] = [];
  private recentAccountAgesDays: number[] = [];
  private historicalBaseline: HistoricalBaseline;
  private config: Required<AIRaidPredictionConfig>;

  private constructor(config: AIRaidPredictionConfig = {}) {
    this.config = {
      baseline: config.baseline ?? {},
      maxHistorySize: config.maxHistorySize ?? 100,
    };
    this.historicalBaseline = {
      avgJoinsPerMinute: 2.5,
      p95JoinsPerMinute: 8.0,
      maxJoinsPerMinute: 15.0,
      avgFreshAccountRatio: 0.25,
      p95FreshAccountRatio: 0.55,
      ...config.baseline,
    };
  }

  static getInstance(config?: AIRaidPredictionConfig): AIRaidPrediction {
    if (!AIRaidPrediction.instance) {
      AIRaidPrediction.instance = new AIRaidPrediction(config);
    }
    return AIRaidPrediction.instance;
  }

  static resetInstance(): void {
    AIRaidPrediction.instance = undefined as any;
  }

  recordJoin(createdTimestamp: number): void {
    const now = Date.now();
    this.joinTimes.push(now);
    this.joinTimes = this.joinTimes.filter(t => now - t < 60000);
    const ageDays = (now - createdTimestamp) / (1000 * 60 * 60 * 24);
    this.recentAccountAgesDays.push(ageDays);
    if (this.recentAccountAgesDays.length > this.config.maxHistorySize) {
      this.recentAccountAgesDays.shift();
    }
  }

  predict(): RaidPredictionResult {
    const joinVelocity = this.joinTimes.length;
    const totalAccounts = this.recentAccountAgesDays.length;
    const freshAccounts = this.recentAccountAgesDays.filter(age => age < 7).length;
    const freshRatio = totalAccounts > 0 ? freshAccounts / totalAccounts : 0;

    const velocityZScore = joinVelocity > 0 
      ? (joinVelocity - this.historicalBaseline.avgJoinsPerMinute) / (this.historicalBaseline.p95JoinsPerMinute - this.historicalBaseline.avgJoinsPerMinute || 1)
      : 0;
    const freshZScore = totalAccounts > 10
      ? (freshRatio - this.historicalBaseline.avgFreshAccountRatio) / (this.historicalBaseline.p95FreshAccountRatio - this.historicalBaseline.avgFreshAccountRatio || 1)
      : 0;

    let priorProbability = 5;
    let likelihood = 0;

    if (velocityZScore > 2.0) {
      likelihood += 40;
    } else if (velocityZScore > 1.0) {
      likelihood += 20;
    } else if (velocityZScore > 0.5) {
      likelihood += 10;
    }

    if (freshZScore > 2.0) {
      likelihood += 35;
    } else if (freshZScore > 1.0) {
      likelihood += 18;
    } else if (freshZScore > 0.5) {
      likelihood += 8;
    }

    if (totalAccounts > 20) {
      const veryFresh = this.recentAccountAgesDays.filter(age => age < 1).length;
      const veryFreshRatio = veryFresh / totalAccounts;
      if (veryFreshRatio > 0.4) {
        likelihood += 15;
      }
    }

    let prob = Math.min(100, Math.max(0, priorProbability + likelihood));
    const factors: string[] = [];

    if (velocityZScore > 1.0) {
      factors.push(`Statistical anomaly: join velocity ${joinVelocity}/min (z=${velocityZScore.toFixed(2)})`);
    }
    if (freshZScore > 1.0) {
      factors.push(`Account age anomaly: ${Math.round(freshRatio * 100)}% fresh accounts (z=${freshZScore.toFixed(2)})`);
    }
    if (totalAccounts > 20 && this.recentAccountAgesDays.filter(age => age < 1).length / totalAccounts > 0.4) {
      factors.push("High concentration of accounts created < 24h ago");
    }

    let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
    if (prob >= 80) riskLevel = "CRITICAL";
    else if (prob >= 50) riskLevel = "HIGH";
    else if (prob >= 30) riskLevel = "MEDIUM";

    return {
      predictedRaidProbability: Math.round(prob),
      riskLevel,
      timeToImpactSeconds: prob > 70 ? 15 : (prob > 40 ? 60 : 300),
      factors: factors.length > 0 ? factors : ["Join patterns within normal statistical baseline"],
      recommendation: prob > 60 
        ? "PRE-EMPTIVE ACTION: Enable verification level 3+ and temporary 10-minute join lockdown." 
        : (prob > 30 
          ? "Elevated monitoring recommended. Consider raising verification level." 
          : "Patterns normal. Continue standard monitoring.")
    };
  }

  updateBaseline(newBaseline: Partial<HistoricalBaseline>): void {
    this.historicalBaseline = { ...this.historicalBaseline, ...newBaseline };
  }

  getBaseline(): HistoricalBaseline {
    return { ...this.historicalBaseline };
  }

  getCurrentStats() {
    return {
      currentVelocity: this.joinTimes.length,
      totalAccounts: this.recentAccountAgesDays.length,
      freshRatio: this.recentAccountAgesDays.length > 0 
        ? this.recentAccountAgesDays.filter(a => a < 7).length / this.recentAccountAgesDays.length 
        : 0,
    };
  }

  clear(): void {
    this.joinTimes = [];
    this.recentAccountAgesDays = [];
  }
}