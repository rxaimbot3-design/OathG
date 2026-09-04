import { EventEmitter } from "events";
import { TtlMap } from "../security/MapManager.js";
import { log, createModuleLogger } from "../logging/logger.js";
import { mlAnomalyDetector, AnomalyFeatures } from "./MLAnomalyDetector.js";

const logger = createModuleLogger("PredictiveNukeDefense");

export interface ThreatPrediction {
  guildId: string;
  probability: number;
  timeToImpact: number;
  threatType: "raid" | "nuke" | "token_grab" | "insider" | "webhook" | "bot_infiltration";
  indicators: string[];
  confidence: number;
  recommendedActions: string[];
}

export interface NukeAttempt {
  executorId: string;
  guildId: string;
  actionType: string;
  timestamp: number;
  severity: number;
  wasBlocked: boolean;
  context: Record<string, any>;
}

export interface DefenseLayer {
  name: string;
  enabled: boolean;
  priority: number;
  canPreempt: boolean;
  execute: (prediction: ThreatPrediction) => Promise<{ success: boolean; actions: string[] }>;
}

interface DefenseEvents {
  defenseExecuted: [{ layer: string; prediction: ThreatPrediction; actions: string[] }];
}

export class PredictiveNukeDefense extends EventEmitter {
  private static instance: PredictiveNukeDefense;
  
  private threatHistory = new TtlMap<string, NukeAttempt[]>({ 
    ttlMs: 24 * 60 * 60 * 1000, 
    maxEntries: 10000, 
    autoCleanupMs: 60 * 60 * 1000 
  });
  
  private guildThreatScores = new TtlMap<string, number>({ 
    ttlMs: 60 * 60 * 1000, 
    maxEntries: 10000, 
    autoCleanupMs: 5 * 60 * 1000 
  });
  
  private predictionCache = new TtlMap<string, ThreatPrediction>({ 
    ttlMs: 5 * 60 * 1000, 
    maxEntries: 5000, 
    autoCleanupMs: 60 * 1000 
  });
  
  private defenseLayers: DefenseLayer[] = [];
  private activePredictions = new Map<string, ThreatPrediction>();
  private preemptiveActions = new TtlMap<string, { action: string; timestamp: number }>({ 
    ttlMs: 10 * 60 * 1000, 
    maxEntries: 1000, 
    autoCleanupMs: 60 * 1000 
  });
  
  private predictionModels = {
    raid: this.predictRaid.bind(this),
    nuke: this.predictNuke.bind(this),
    token_grab: this.predictTokenGrab.bind(this),
    insider: this.predictInsiderThreat.bind(this),
    webhook: this.predictWebhookCompromise.bind(this),
    bot_infiltration: this.predictBotInfiltration.bind(this)
  };
  
  private constructor() {
    super();
    this.initializeDefenseLayers();
    this.startPredictionEngine();
    this.startThreatScoreDecay();
  }
  
  static getInstance(): PredictiveNukeDefense {
    if (!PredictiveNukeDefense.instance) {
      PredictiveNukeDefense.instance = new PredictiveNukeDefense();
    }
    return PredictiveNukeDefense.instance;
  }
  
  private initializeDefenseLayers() {
    this.defenseLayers = [
      {
        name: "Preemptive Lockdown",
        enabled: true,
        priority: 1,
        canPreempt: true,
        execute: async (prediction) => {
          const actions: string[] = [];
          if (prediction.probability > 0.85) {
            actions.push("Initiate full server lockdown");
            actions.push("Disable all invites");
            actions.push("Set verification level to highest");
            actions.push("Freeze all role/channel modifications");
          }
          return { success: true, actions };
        }
      },
      {
        name: "Intelligent Rate Limiting",
        enabled: true,
        priority: 2,
        canPreempt: true,
        execute: async (prediction) => {
          const actions: string[] = [];
          actions.push("Apply aggressive rate limits to suspicious users");
          actions.push("Enable strict join velocity checks");
          actions.push("Activate message content scanning");
          return { success: true, actions };
        }
      },
      {
        name: "Behavioral Quarantine",
        enabled: true,
        priority: 3,
        canPreempt: true,
        execute: async (prediction) => {
          const actions: string[] = [];
          actions.push("Quarantine high-risk users preemptively");
          actions.push("Require verification for new joins");
          actions.push("Monitor all admin actions with enhanced scrutiny");
          return { success: true, actions };
        }
      },
      {
        name: "Infrastructure Hardening",
        enabled: true,
        priority: 4,
        canPreempt: false,
        execute: async (prediction) => {
          const actions: string[] = [];
          actions.push("Rotate webhook tokens");
          actions.push("Audit all integrations");
          actions.push("Verify bot permissions hierarchy");
          actions.push("Create emergency snapshot");
          return { success: true, actions };
        }
      },
      {
        name: "Deception & Honeypots",
        enabled: true,
        priority: 5,
        canPreempt: false,
        execute: async (prediction) => {
          const actions: string[] = [];
          actions.push("Deploy fake admin channels as honeypots");
          actions.push("Create canary tokens in sensitive locations");
          actions.push("Set up fake webhook endpoints");
          return { success: true, actions };
        }
      }
    ];
  }
  
  async analyzeAndPredict(guildId: string, features: AnomalyFeatures): Promise<ThreatPrediction[]> {
    const cacheKey = `${guildId}:${features.userId}`;
    const cached = this.predictionCache.get(cacheKey);
    if (cached && Date.now() - (cached as any).timestamp < 60000) {
      return [cached];
    }
    
    const predictions: ThreatPrediction[] = [];
    
    for (const [threatType, model] of Object.entries(this.predictionModels)) {
      try {
        const prediction = await model(guildId, features);
        if (prediction.probability > 0.3) {
          predictions.push(prediction);
        }
      } catch (err) {
        log.error({ module: "PredictiveNukeDefense" }, "Prediction model failed", { threatType, error: err });
      }
    }
    
    predictions.sort((a, b) => b.probability - a.probability);
    
    if (predictions.length > 0) {
      const topPrediction = predictions[0];
      this.predictionCache.set(cacheKey, { ...topPrediction, timestamp: Date.now() } as any);
      this.activePredictions.set(cacheKey, topPrediction);
      
      if (topPrediction.probability > 0.7) {
        await this.executePreemptiveDefense(topPrediction);
      }
    }
    
    return predictions;
  }
  
  private async predictRaid(guildId: string, features: AnomalyFeatures): Promise<ThreatPrediction> {
    const recentJoins = this.getRecentActions(guildId, "guildMemberAdd", 300000);
    const joinVelocity = recentJoins.length / 5;
    
    const recentBans = this.getRecentActions(guildId, "guildBanAdd", 300000);
    const banVelocity = recentBans.length / 5;
    
    const probability = Math.min(1, 
      (joinVelocity / 20) * 0.4 +
      (banVelocity / 10) * 0.3 +
      (features.velocity / 50) * 0.3
    );
    
    return {
      guildId,
      probability,
      timeToImpact: Math.max(60000, 300000 - joinVelocity * 5000),
      threatType: "raid",
      indicators: [
        joinVelocity > 10 ? "HIGH_JOIN_VELOCITY" : "NORMAL_JOINS",
        banVelocity > 5 ? "SIMULTANEOUS_BANS" : "NO_BANS",
        features.accountAge < 7 ? "NEW_ACCOUNTS" : "ESTABLISHED_ACCOUNTS"
      ],
      confidence: 0.85,
      recommendedActions: [
        "Enable join rate limiting",
        "Activate verification gate",
        "Monitor for coordinated behavior"
      ]
    };
  }
  
  private async predictNuke(guildId: string, features: AnomalyFeatures): Promise<ThreatPrediction> {
    const recentDestructive = this.getRecentActions(guildId, "channelDelete", 60000)
      .concat(this.getRecentActions(guildId, "roleDelete", 60000))
      .concat(this.getRecentActions(guildId, "guildBanAdd", 60000))
      .concat(this.getRecentActions(guildId, "guildMemberRemove", 60000));
    
    const destructiveVelocity = recentDestructive.length;
    const uniqueActors = new Set(recentDestructive.map(a => a.executorId)).size;
    
    const isInsider = uniqueActors === 1 && destructiveVelocity > 3;
    const isCoordinated = uniqueActors > 1 && destructiveVelocity > 5;
    
    let probability = 0;
    if (isInsider) probability = 0.9;
    else if (isCoordinated) probability = 0.85;
    else if (destructiveVelocity > 10) probability = 0.7;
    else if (destructiveVelocity > 5) probability = 0.5;
    
    const threatScore = this.guildThreatScores.get(guildId) || 0;
    probability = Math.max(probability, threatScore * 0.5);
    
    return {
      guildId,
      probability,
      timeToImpact: isInsider ? 30000 : Math.max(60000, 120000 - destructiveVelocity * 5000),
      threatType: "nuke",
      indicators: [
        isInsider ? "SINGLE_ACTOR_NUKE" : "NORMAL",
        isCoordinated ? "COORDINATED_ATTACK" : "NORMAL",
        destructiveVelocity > 10 ? "HIGH_DESTRUCTIVE_VELOCITY" : "NORMAL"
      ],
      confidence: isInsider ? 0.95 : 0.8,
      recommendedActions: [
        "Enable zero-trust admin verification",
        "Activate instant revert for destructive actions",
        "Alert server owner immediately",
        "Prepare snapshot for instant recovery"
      ]
    };
  }
  
  private async predictTokenGrab(guildId: string, features: AnomalyFeatures): Promise<ThreatPrediction> {
    const suspiciousPatterns = [
      "token",
      "grabber",
      "stealer",
      "logger",
      "nitro",
      "free",
      "gift",
      "verify"
    ];
    
    const recentMessages = this.getRecentActions(guildId, "messageCreate", 300000);
    const suspiciousMessages = recentMessages.filter(m => 
      suspiciousPatterns.some(p => m.context.content?.toLowerCase().includes(p))
    ).length;
    
    const probability = Math.min(1, suspiciousMessages / 20);
    
    return {
      guildId,
      probability,
      timeToImpact: 1800000,
      threatType: "token_grab",
      indicators: [
        suspiciousMessages > 5 ? "PHISHING_ATTEMPTS_DETECTED" : "NO_PHISHING",
        features.ipReputation > 0.7 ? "MALICIOUS_IP" : "CLEAN_IP"
      ],
      confidence: 0.7,
      recommendedActions: [
        "Enable DM firewall",
        "Activate anti-phishing scanning",
        "Deploy honeypot links"
      ]
    };
  }
  
  private async predictInsiderThreat(guildId: string, features: AnomalyFeatures): Promise<ThreatPrediction> {
    const adminActions = this.getRecentAdminActions(guildId, 3600000);
    const velocity = adminActions.length;
    
    const velocityAnomaly = await mlAnomalyDetector.analyze({
      ...features,
      actionType: "admin_action",
      velocity,
      frequency: velocity / 60
    });
    
    const probability = velocityAnomaly.score * 0.7 + (features.reputationScore < 0.3 ? 0.3 : 0);
    
    return {
      guildId,
      probability,
      timeToImpact: velocity > 20 ? 60000 : 300000,
      threatType: "insider",
      indicators: [
        velocity > 20 ? "ADMIN_ACTION_SPIKE" : "NORMAL_ADMIN_ACTIVITY",
        velocityAnomaly.isAnomaly ? "BEHAVIORAL_ANOMALY" : "NORMAL_BEHAVIOR",
        features.accountAge < 30 ? "RECENTLY_PROMOTED" : "ESTABLISHED_ADMIN"
      ],
      confidence: 0.8,
      recommendedActions: [
        "Enable strict admin action monitoring",
        "Require secondary confirmation for destructive actions",
        "Activate compromised account detection"
      ]
    };
  }
  
  private async predictWebhookCompromise(guildId: string, features: AnomalyFeatures): Promise<ThreatPrediction> {
    const webhookCreates = this.getRecentActions(guildId, "webhookCreate", 3600000);
    const webhookExecutes = this.getRecentActions(guildId, "webhookExecute", 300000);
    
    const probability = Math.min(1, 
      (webhookCreates.length / 5) * 0.5 +
      (webhookExecutes.length / 50) * 0.5
    );
    
    return {
      guildId,
      probability,
      timeToImpact: 600000,
      threatType: "webhook",
      indicators: [
        webhookCreates.length > 3 ? "EXCESSIVE_WEBHOOK_CREATION" : "NORMAL",
        webhookExecutes.length > 20 ? "HIGH_WEBHOOK_TRAFFIC" : "NORMAL"
      ],
      confidence: 0.75,
      recommendedActions: [
        "Audit all webhooks",
        "Revoke suspicious webhook tokens",
        "Enable webhook guard"
      ]
    };
  }
  
  private async predictBotInfiltration(guildId: string, features: AnomalyFeatures): Promise<ThreatPrediction> {
    const recentBotAdds = this.getRecentActions(guildId, "botAdd", 3600000);
    const probability = Math.min(1, recentBotAdds.length / 3);
    
    return {
      guildId,
      probability,
      timeToImpact: 1800000,
      threatType: "bot_infiltration",
      indicators: [
        recentBotAdds.length > 1 ? "MULTIPLE_BOT_ADDS" : "NORMAL",
        features.reputationScore < 0.4 ? "UNTRUSTED_BOTS" : "VERIFIED_BOTS"
      ],
      confidence: 0.8,
      recommendedActions: [
        "Enable zero-trust bot policy",
        "Auto-kick unapproved bots",
        "Audit bot permissions"
      ]
    };
  }
  
  private getRecentActions(guildId: string, actionType: string, windowMs: number): NukeAttempt[] {
    const history = this.threatHistory.get(guildId) || [];
    const now = Date.now();
    return history.filter(a => 
      a.actionType === actionType && 
      now - a.timestamp < windowMs
    );
  }
  
  private getRecentAdminActions(guildId: string, windowMs: number): NukeAttempt[] {
    const history = this.threatHistory.get(guildId) || [];
    const now = Date.now();
    const adminActions = ["channelDelete", "roleDelete", "guildBanAdd", "guildMemberRemove", "channelCreate", "roleCreate", "webhookCreate"];
    return history.filter(a => 
      adminActions.includes(a.actionType) && 
      now - a.timestamp < windowMs
    );
  }
  
  private async executePreemptiveDefense(prediction: ThreatPrediction) {
    const key = `${prediction.guildId}:${prediction.threatType}`;
    if (this.preemptiveActions.has(key)) return;
    
    this.preemptiveActions.set(key, { action: "preemptive_defense", timestamp: Date.now() });
    
    log.warn({ module: "PredictiveNukeDefense" }, "🚨 EXECUTING PREEMPTIVE NUKE DEFENSE", {
      guildId: prediction.guildId,
      threatType: prediction.threatType,
      probability: prediction.probability
    });
    
    for (const layer of this.defenseLayers.sort((a, b) => a.priority - b.priority)) {
      if (!layer.enabled || !layer.canPreempt) continue;
      
      try {
        const result = await layer.execute(prediction);
        if (result.success) {
          log.info({ module: "PredictiveNukeDefense" }, `Defense layer executed: ${layer.name}`, { actions: result.actions });
          this.emit("defenseExecuted", { layer: layer.name, prediction, actions: result.actions });
        }
      } catch (err) {
        log.error({ module: "PredictiveNukeDefense" }, `Defense layer failed: ${layer.name}`, { error: err });
      }
    }
    
    this.guildThreatScores.set(prediction.guildId, Math.min(1, (this.guildThreatScores.get(prediction.guildId) || 0) + 0.2));
  }
  
  recordNukeAttempt(attempt: NukeAttempt) {
    const history = this.threatHistory.get(attempt.guildId) || [];
    history.push(attempt);
    this.threatHistory.set(attempt.guildId, history);
    
    if (!attempt.wasBlocked) {
      this.guildThreatScores.set(attempt.guildId, Math.min(1, (this.guildThreatScores.get(attempt.guildId) || 0) + 0.15));
    }
    
    // Trigger immediate prediction for high-severity attempts
    if (attempt.severity > 0.8) {
      this.triggerPredictionForGuild(attempt.guildId);
    }
  }
  
  private triggerPredictionForGuild(guildId: string) {
    const history = this.threatHistory.get(guildId) || [];
    const recentAttempts = history.filter(a => Date.now() - a.timestamp < 60000);
    
    if (recentAttempts.length === 0) return;
    
    // Create synthetic features from recent attempts
    const uniqueActors = new Set(recentAttempts.map(a => a.executorId));
    const actionTypes = new Set(recentAttempts.map(a => a.actionType));
    const avgSeverity = recentAttempts.reduce((sum, a) => sum + a.severity, 0) / recentAttempts.length;
    
    const features: AnomalyFeatures = {
      userId: `guild_analysis_${guildId}`,
      guildId,
      actionType: "guild_analysis",
      timestamp: Date.now(),
      frequency: recentAttempts.length,
      velocity: recentAttempts.length,
      entropy: actionTypes.size / Math.max(1, uniqueActors.size),
      deviation: uniqueActors.size > 1 ? 0.8 : 0.2,
      accountAge: 1,
      reputationScore: 0.1,
      ipReputation: 0.9,
      behavioralVector: [recentAttempts.length, recentAttempts.length, actionTypes.size, avgSeverity, 0.002]
    };
    
    // Run prediction asynchronously
    this.analyzeAndPredict(guildId, features).catch(err => 
      log.error({ module: "PredictiveNukeDefense" }, "Triggered prediction failed", { error: err })
    );
  }
  
  private startPredictionEngine() {
    // Run more frequently for faster detection
    setInterval(() => {
      this.runPredictions();
    }, 1000);
  }
  
  async forcePrediction(guildId: string): Promise<ThreatPrediction[]> {
    // Create synthetic features from recent history
    const history = this.threatHistory.get(guildId) || [];
    const recentAttempts = history.filter(a => Date.now() - a.timestamp < 60000);
    
    if (recentAttempts.length === 0) return [];
    
    const uniqueActors = new Set(recentAttempts.map(a => a.executorId));
    const actionTypes = new Set(recentAttempts.map(a => a.actionType));
    const avgSeverity = recentAttempts.reduce((sum, a) => sum + a.severity, 0) / recentAttempts.length;
    
    const features: AnomalyFeatures = {
      userId: `guild_analysis_${guildId}`,
      guildId,
      actionType: "guild_analysis",
      timestamp: Date.now(),
      frequency: recentAttempts.length,
      velocity: recentAttempts.length,
      entropy: actionTypes.size / Math.max(1, uniqueActors.size),
      deviation: uniqueActors.size > 1 ? 0.8 : 0.2,
      accountAge: 1,
      reputationScore: 0.1,
      ipReputation: 0.9,
      behavioralVector: [recentAttempts.length, recentAttempts.length, actionTypes.size, avgSeverity, 0.002]
    };
    
    return this.analyzeAndPredict(guildId, features);
  }
  
  private async runPredictions() {
    for (const [key, prediction] of this.activePredictions) {
      const age = Date.now() - (prediction as any).timestamp;
      if (age > 300000) {
        this.activePredictions.delete(key);
        continue;
      }
      
      if (prediction.probability > 0.8 && !this.preemptiveActions.has(key)) {
        await this.executePreemptiveDefense(prediction);
      }
    }
  }
  
  private startThreatScoreDecay() {
    setInterval(() => {
      for (const [guildId, score] of this.guildThreatScores.entries()) {
        this.guildThreatScores.set(guildId, Math.max(0, score * 0.95));
      }
    }, 60000);
  }
  
  getThreatScore(guildId: string): number {
    return this.guildThreatScores.get(guildId) || 0;
  }
  
  getActivePredictions(guildId?: string): ThreatPrediction[] {
    const predictions = Array.from(this.activePredictions.values());
    return guildId ? predictions.filter(p => p.guildId === guildId) : predictions;
  }
  
  getStats() {
    return {
      threatHistorySize: this.threatHistory.size,
      guildsTracked: this.guildThreatScores.size,
      activePredictions: this.activePredictions.size,
      preemptiveActionsTaken: this.preemptiveActions.size,
      defenseLayers: this.defenseLayers.length
    };
  }
  
  async shutdown() {
    this.removeAllListeners();
    this.threatHistory.clear();
    this.guildThreatScores.clear();
    this.predictionCache.clear();
    this.activePredictions.clear();
    this.preemptiveActions.clear();
    log.info({ module: "PredictiveNukeDefense" }, "PredictiveNukeDefense shutdown complete");
  }
}

export const predictiveNukeDefense = PredictiveNukeDefense.getInstance();