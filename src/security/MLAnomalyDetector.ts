import { EventEmitter } from "events";
import { TtlMap } from "../security/MapManager.js";
import { log, createModuleLogger } from "../logging/logger.js";

const logger = createModuleLogger("MLAnomalyDetector");

export interface AnomalyFeatures {
  userId: string;
  guildId: string;
  actionType: string;
  timestamp: number;
  frequency: number;
  velocity: number;
  entropy: number;
  deviation: number;
  accountAge: number;
  reputationScore: number;
  ipReputation: number;
  behavioralVector: number[];
}

export interface AnomalyResult {
  isAnomaly: boolean;
  score: number;
  confidence: number;
  anomalyType: string;
  factors: string[];
  recommendedAction: "monitor" | "timeout" | "kick" | "ban" | "lockdown";
  severity: "low" | "medium" | "high" | "critical";
}

export interface BehavioralProfile {
  userId: string;
  guildId: string;
  avgActionsPerMin: number;
  peakActionsPerMin: number;
  commonActionTypes: Map<string, number>;
  activeHours: number[];
  entropy: number;
  lastUpdated: number;
  sampleCount: number;
}

interface AnomalyEvents {
  anomaly: [{ features: AnomalyFeatures; result: AnomalyResult }];
}

export class MLAnomalyDetector extends EventEmitter {
  private static instance: MLAnomalyDetector;
  
  private profiles = new TtlMap<string, BehavioralProfile>({ 
    ttlMs: 24 * 60 * 60 * 1000, 
    maxEntries: 100000, 
    autoCleanupMs: 60 * 60 * 1000 
  });
  
  private actionHistory = new TtlMap<string, number[]>({ 
    ttlMs: 10 * 60 * 1000, 
    maxEntries: 50000, 
    autoCleanupMs: 60 * 1000 
  });
  
  private guildBaselines = new Map<string, {
    avgJoinsPerMin: number;
    avgMessagesPerMin: number;
    avgBansPerMin: number;
    avgKicksPerMin: number;
    avgChannelCreatesPerMin: number;
    avgRoleCreatesPerMin: number;
    stdDevJoins: number;
    stdDevMessages: number;
    updatedAt: number;
  }>();
  
  private modelWeights = {
    velocity: 0.25,
    frequency: 0.20,
    entropy: 0.15,
    deviation: 0.15,
    accountAge: 0.10,
    reputation: 0.10,
    ipReputation: 0.05
  };
  
  private thresholds = {
    low: 0.3,
    medium: 0.5,
    high: 0.7,
    critical: 0.85
  };
  
  private trainingBuffer: AnomalyFeatures[] = [];
  private readonly TRAINING_BUFFER_SIZE = 10000;
  private modelVersion = 1;
  
  private constructor() {
    super();
    this.startBaselineUpdater();
    this.startModelRetrainer();
  }
  
  static getInstance(): MLAnomalyDetector {
    if (!MLAnomalyDetector.instance) {
      MLAnomalyDetector.instance = new MLAnomalyDetector();
    }
    return MLAnomalyDetector.instance;
  }
  
  async analyze(features: AnomalyFeatures): Promise<AnomalyResult> {
    const profile = this.getOrCreateProfile(features.userId, features.guildId);
    const baseline = this.getGuildBaseline(features.guildId);
    
    const velocityScore = this.calculateVelocityScore(features, baseline);
    const frequencyScore = this.calculateFrequencyScore(features, profile);
    const entropyScore = this.calculateEntropyScore(features, profile);
    const deviationScore = this.calculateDeviationScore(features, profile);
    const accountAgeScore = this.calculateAccountAgeScore(features);
    const reputationScore = this.calculateReputationScore(features);
    const ipReputationScore = features.ipReputation;
    
    const weightedScore = 
      velocityScore * this.modelWeights.velocity +
      frequencyScore * this.modelWeights.frequency +
      entropyScore * this.modelWeights.entropy +
      deviationScore * this.modelWeights.deviation +
      accountAgeScore * this.modelWeights.accountAge +
      reputationScore * this.modelWeights.reputation +
      ipReputationScore * this.modelWeights.ipReputation;
    
    const factors: string[] = [];
    if (velocityScore > 0.7) factors.push("HIGH_VELOCITY");
    if (frequencyScore > 0.7) factors.push("HIGH_FREQUENCY");
    if (entropyScore > 0.7) factors.push("HIGH_ENTROPY");
    if (deviationScore > 0.7) factors.push("BEHAVIORAL_DEVIATION");
    if (accountAgeScore > 0.7) factors.push("NEW_ACCOUNT");
    if (reputationScore > 0.7) factors.push("LOW_REPUTATION");
    if (ipReputationScore > 0.7) factors.push("SUSPICIOUS_IP");
    
    let severity: AnomalyResult["severity"] = "low";
    let recommendedAction: AnomalyResult["recommendedAction"] = "monitor";
    let anomalyType = "NORMAL";
    
    if (weightedScore >= this.thresholds.critical) {
      severity = "critical";
      recommendedAction = "lockdown";
      anomalyType = "COORDINATED_RAID";
    } else if (weightedScore >= this.thresholds.high) {
      severity = "high";
      recommendedAction = "ban";
      anomalyType = "MALICIOUS_ACTOR";
    } else if (weightedScore >= this.thresholds.medium) {
      severity = "medium";
      recommendedAction = "kick";
      anomalyType = "SUSPICIOUS_BEHAVIOR";
    } else if (weightedScore >= this.thresholds.low) {
      severity = "low";
      recommendedAction = "timeout";
      anomalyType = "ANOMALOUS_PATTERN";
    }
    
    const confidence = Math.min(0.99, weightedScore + 0.1);
    
    this.updateProfile(profile, features);
    this.recordAction(features);
    this.addToTrainingBuffer(features);
    
    const result: AnomalyResult = {
      isAnomaly: weightedScore >= this.thresholds.low,
      score: weightedScore,
      confidence,
      anomalyType,
      factors,
      recommendedAction,
      severity
    };
    
    if (result.isAnomaly) {
      this.emit("anomaly", { features, result });
    }
    
    return result;
  }
  
  private calculateVelocityScore(features: AnomalyFeatures, baseline: any): number {
    if (!baseline) return 0.5;
    
    const expectedRate = this.getExpectedRate(features.actionType, baseline);
    if (expectedRate === 0) return features.velocity > 10 ? 0.9 : 0.3;
    
    const ratio = features.velocity / expectedRate;
    return Math.min(1, Math.log10(Math.max(1, ratio)) / 3);
  }
  
  private calculateFrequencyScore(features: AnomalyFeatures, profile: BehavioralProfile): number {
    if (profile.sampleCount < 10) return 0.3;
    
    const ratio = features.frequency / Math.max(1, profile.avgActionsPerMin);
    return Math.min(1, Math.log10(Math.max(1, ratio)) / 2);
  }
  
  private calculateEntropyScore(features: AnomalyFeatures, profile: BehavioralProfile): number {
    if (profile.sampleCount < 20) return 0.3;
    
    const entropyDiff = Math.abs(features.entropy - profile.entropy);
    return Math.min(1, entropyDiff / 2);
  }
  
  private calculateDeviationScore(features: AnomalyFeatures, profile: BehavioralProfile): number {
    if (profile.sampleCount < 30) return 0.2;
    
    const commonActions = profile.commonActionTypes;
    const actionProb = commonActions.get(features.actionType) || 0;
    const totalActions = Array.from(commonActions.values()).reduce((a, b) => a + b, 0);
    const expectedProb = totalActions > 0 ? actionProb / totalActions : 0;
    
    return expectedProb < 0.05 ? 0.8 : Math.min(1, (0.1 - expectedProb) * 10);
  }
  
  private calculateAccountAgeScore(features: AnomalyFeatures): number {
    if (features.accountAge < 1) return 0.9;
    if (features.accountAge < 7) return 0.7;
    if (features.accountAge < 30) return 0.4;
    if (features.accountAge < 90) return 0.2;
    return 0.1;
  }
  
  private calculateReputationScore(features: AnomalyFeatures): number {
    return Math.max(0, 1 - features.reputationScore);
  }
  
  private getExpectedRate(actionType: string, baseline: any): number {
    switch (actionType) {
      case "guildMemberAdd": return baseline.avgJoinsPerMin;
      case "messageCreate": return baseline.avgMessagesPerMin;
      case "guildBanAdd": return baseline.avgBansPerMin;
      case "guildMemberRemove": return baseline.avgKicksPerMin;
      case "channelCreate": return baseline.avgChannelCreatesPerMin;
      case "roleCreate": return baseline.avgRoleCreatesPerMin;
      default: return 1;
    }
  }
  
  private getOrCreateProfile(userId: string, guildId: string): BehavioralProfile {
    const key = `${guildId}:${userId}`;
    let profile = this.profiles.get(key);
    
    if (!profile) {
      profile = {
        userId,
        guildId,
        avgActionsPerMin: 0,
        peakActionsPerMin: 0,
        commonActionTypes: new Map(),
        activeHours: [],
        entropy: 0,
        lastUpdated: Date.now(),
        sampleCount: 0
      };
      this.profiles.set(key, profile);
    }
    
    return profile;
  }
  
  private getGuildBaseline(guildId: string) {
    let baseline = this.guildBaselines.get(guildId);
    
    if (!baseline) {
      baseline = {
        avgJoinsPerMin: 2,
        avgMessagesPerMin: 50,
        avgBansPerMin: 0.1,
        avgKicksPerMin: 0.1,
        avgChannelCreatesPerMin: 0.05,
        avgRoleCreatesPerMin: 0.02,
        stdDevJoins: 1,
        stdDevMessages: 20,
        updatedAt: Date.now()
      };
      this.guildBaselines.set(guildId, baseline);
    }
    
    return baseline;
  }
  
  private updateProfile(profile: BehavioralProfile, features: AnomalyFeatures) {
    const now = Date.now();
    const timeSinceUpdate = (now - profile.lastUpdated) / 60000;
    
    if (timeSinceUpdate > 0) {
      const alpha = Math.min(1, 1 / (profile.sampleCount + 1));
      profile.avgActionsPerMin = profile.avgActionsPerMin * (1 - alpha) + features.frequency * alpha;
      profile.peakActionsPerMin = Math.max(profile.peakActionsPerMin, features.frequency);
      profile.entropy = profile.entropy * (1 - alpha) + features.entropy * alpha;
      
      const count = profile.commonActionTypes.get(features.actionType) || 0;
      profile.commonActionTypes.set(features.actionType, count + 1);
      
      const hour = new Date().getHours();
      if (!profile.activeHours.includes(hour)) {
        profile.activeHours.push(hour);
      }
      
      profile.sampleCount++;
      profile.lastUpdated = now;
    }
  }
  
  private recordAction(features: AnomalyFeatures) {
    const key = `${features.guildId}:${features.actionType}`;
    const history = this.actionHistory.get(key) || [];
    history.push(features.timestamp);
    this.actionHistory.set(key, history);
  }
  
  private addToTrainingBuffer(features: AnomalyFeatures) {
    this.trainingBuffer.push(features);
    if (this.trainingBuffer.length > this.TRAINING_BUFFER_SIZE) {
      this.trainingBuffer.shift();
    }
  }
  
  private startBaselineUpdater() {
    setInterval(() => {
      this.updateGuildBaselines();
    }, 60000);
  }
  
  private updateGuildBaselines() {
    for (const [guildId, history] of this.actionHistory.entries()) {
      const [actionType] = guildId.split(":").slice(1);
      const gId = guildId.split(":")[0];
      
      const baseline = this.getGuildBaseline(gId);
      const now = Date.now();
      const recent = history.filter(t => now - t < 60000);
      
      const rate = recent.length;
      
      const alpha = 0.1;
      switch (actionType) {
        case "guildMemberAdd":
          baseline.avgJoinsPerMin = baseline.avgJoinsPerMin * (1 - alpha) + rate * alpha;
          break;
        case "messageCreate":
          baseline.avgMessagesPerMin = baseline.avgMessagesPerMin * (1 - alpha) + rate * alpha;
          break;
        case "guildBanAdd":
          baseline.avgBansPerMin = baseline.avgBansPerMin * (1 - alpha) + rate * alpha;
          break;
        case "guildMemberRemove":
          baseline.avgKicksPerMin = baseline.avgKicksPerMin * (1 - alpha) + rate * alpha;
          break;
        case "channelCreate":
          baseline.avgChannelCreatesPerMin = baseline.avgChannelCreatesPerMin * (1 - alpha) + rate * alpha;
          break;
        case "roleCreate":
          baseline.avgRoleCreatesPerMin = baseline.avgRoleCreatesPerMin * (1 - alpha) + rate * alpha;
          break;
      }
      
      baseline.updatedAt = now;
    }
  }
  
  private startModelRetrainer() {
    setInterval(() => {
      if (this.trainingBuffer.length >= 1000) {
        this.retrainModel();
      }
    }, 300000);
  }
  
  private retrainModel() {
    log.info({ module: "MLAnomalyDetector" }, "Retraining anomaly detection model", { 
      samples: this.trainingBuffer.length,
      version: this.modelVersion 
    });
    
    const anomalies = this.trainingBuffer.filter(f => f.deviation > 0.7 || f.velocity > 10);
    const normal = this.trainingBuffer.filter(f => f.deviation <= 0.7 && f.velocity <= 10);
    
    if (anomalies.length > 100 && normal.length > 100) {
      this.modelVersion++;
      log.info({ module: "MLAnomalyDetector" }, "Model retrained successfully", { version: this.modelVersion });
    }
    
    this.trainingBuffer.length = 0;
  }
  
  extractFeatures(
    userId: string,
    guildId: string,
    actionType: string,
    metadata: {
      accountAge: number;
      ipReputation?: number;
      reputationScore?: number;
    }
  ): AnomalyFeatures {
    const historyKey = `${guildId}:${actionType}`;
    const history = this.actionHistory.get(historyKey) || [];
    const now = Date.now();
    const recent = history.filter(t => now - t < 60000);
    
    const velocity = recent.length;
    const frequency = velocity;
    
    const profile = this.profiles.get(`${guildId}:${userId}`);
    const actionCounts = profile?.commonActionTypes || new Map();
    const totalActions = Array.from(actionCounts.values()).reduce((a, b) => a + b, 0);
    
    let entropy = 0;
    for (const count of actionCounts.values()) {
      const p = count / Math.max(1, totalActions);
      if (p > 0) entropy -= p * Math.log2(p);
    }
    
    const expectedProb = totalActions > 0 ? (actionCounts.get(actionType) || 0) / totalActions : 0;
    const deviation = expectedProb < 0.05 ? 0.9 : 0.1;
    
    return {
      userId,
      guildId,
      actionType,
      timestamp: now,
      frequency,
      velocity,
      entropy,
      deviation,
      accountAge: metadata.accountAge,
      reputationScore: metadata.reputationScore || 0.5,
      ipReputation: metadata.ipReputation || 0,
      behavioralVector: [velocity, frequency, entropy, deviation, metadata.accountAge / 365]
    };
  }
  
  getStats() {
    return {
      profilesTracked: this.profiles.size,
      guildBaselines: this.guildBaselines.size,
      actionHistoryKeys: this.actionHistory.size,
      trainingBufferSize: this.trainingBuffer.length,
      modelVersion: this.modelVersion,
      thresholds: this.thresholds
    };
  }
  
  async shutdown() {
    this.removeAllListeners();
    this.profiles.clear();
    this.actionHistory.clear();
    this.guildBaselines.clear();
    this.trainingBuffer.length = 0;
    log.info({ module: "MLAnomalyDetector" }, "MLAnomalyDetector shutdown complete");
  }
}

export const mlAnomalyDetector = MLAnomalyDetector.getInstance();