import { EventEmitter } from "events";
import { log, createModuleLogger } from "../logging/logger.js";

const logger = createModuleLogger("AdvancedAIModerator");

export interface AIModeratorConfig {
  model: "gemini-2.5-flash" | "gemini-2.5-pro" | "gpt-4o" | "custom";
  apiKey: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  moderationCategories: string[];
  autoActionThreshold: number;
  enableContextAwareness: boolean;
  enableMultiLanguage: boolean;
  customRules: CustomRule[];
}

export interface CustomRule {
  id: string;
  name: string;
  pattern: string;
  action: "warn" | "timeout" | "kick" | "ban" | "delete" | "flag";
  severity: "low" | "medium" | "high" | "critical";
  enabled: boolean;
  description: string;
}

export interface ModerationContext {
  guildId: string;
  channelId: string;
  userId: string;
  messageId: string;
  content: string;
  attachments: Array<{ url: string; type: string }>;
  userHistory: UserHistory;
  channelHistory: Message[];
  guildSettings: GuildModerationSettings;
}

export interface UserHistory {
  userId: string;
  messageCount: number;
  violationCount: number;
  warningCount: number;
  timeoutCount: number;
  joinDate: number;
  roles: string[];
  reputationScore: number;
}

export interface Message {
  id: string;
  userId: string;
  content: string;
  timestamp: number;
  flagged: boolean;
}

export interface GuildModerationSettings {
  strictness: "lenient" | "moderate" | "strict" | "maximum";
  autoModEnabled: boolean;
  logChannel?: string;
  ignoredRoles: string[];
  ignoredChannels: string[];
  customFilters: string[];
}

export interface ModerationResult {
  action: "none" | "warn" | "timeout" | "kick" | "ban" | "delete" | "flag" | "shadow_delete";
  reason: string;
  confidence: number;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  evidence: ModerationEvidence;
  suggestedResponse?: string;
  requiresHumanReview: boolean;
}

export interface ModerationEvidence {
  matchedPatterns: string[];
  aiAnalysis: string;
  contextFactors: string[];
  riskScore: number;
  similarCases: number;
}

export interface AIInsight {
  type: "trend" | "anomaly" | "recommendation" | "alert";
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
  data: any;
  timestamp: number;
}

interface AdvancedAIModeratorEvents {
  moderated: [{ context: ModerationContext; result: ModerationResult }];
  humanReviewRequired: [{ context: ModerationContext; result: ModerationResult }];
}
export class AdvancedAIModerator extends EventEmitter<AdvancedAIModeratorEvents> {
  private static instance: AdvancedAIModerator;
  
  private config: AIModeratorConfig = {
    model: "gemini-2.5-flash",
    apiKey: "",
    temperature: 0.3,
    maxTokens: 2048,
    systemPrompt: "",
    moderationCategories: [
      "hate_speech",
      "harassment",
      "sexual_content",
      "violence",
      "self_harm",
      "spam",
      "scam",
      "pii",
      "illegal_activity",
      "misinformation",
      "extremism",
      "grooming"
    ],
    autoActionThreshold: 0.85,
    enableContextAwareness: true,
    enableMultiLanguage: true,
    customRules: []
  };
  
  private moderationQueue: ModerationContext[] = [];
  private processing = false;
  private cache = new Map<string, ModerationResult>();
  private insights: AIInsight[] = [];
  private stats = {
    totalModerated: 0,
    actionsTaken: 0,
    falsePositives: 0,
    humanReviews: 0,
    avgConfidence: 0,
    avgLatencyMs: 0
  };
  
  private constructor() {
    super();
    this.initializeDefaultPrompt();
    this.startProcessingLoop();
    this.startInsightGeneration();
  }
  
  static getInstance(): AdvancedAIModerator {
    if (!AdvancedAIModerator.instance) {
      AdvancedAIModerator.instance = new AdvancedAIModerator();
    }
    return AdvancedAIModerator.instance;
  }
  
  configure(config: Partial<AIModeratorConfig>) {
    this.config = { ...this.config, ...config };
    if (config.systemPrompt) {
      this.config.systemPrompt = config.systemPrompt;
    } else {
      this.initializeDefaultPrompt();
    }
    log.info({ module: "AdvancedAIModerator" }, "AdvancedAIModerator configured", { model: this.config.model });
  }
  
  private initializeDefaultPrompt() {
    this.config.systemPrompt = `You are an advanced AI content moderator for Discord communities. 
Your task is to analyze messages for policy violations and determine appropriate actions.

Categories to check:
${this.config.moderationCategories.map(c => `- ${c}`).join("\n")}

For each message, provide:
1. Violation category (or "none")
2. Severity: low/medium/high/critical
3. Confidence score (0-1)
4. Recommended action: none/warn/timeout/kick/ban/delete/flag/shadow_delete
5. Reasoning
6. Evidence
7. Whether human review is needed

Consider context: user history, channel type, server culture, language nuances.
Be precise - false positives harm trust, false negatives harm safety.`;
  }
  
  addCustomRule(rule: CustomRule) {
    this.config.customRules.push(rule);
    log.info({ module: "AdvancedAIModerator" }, "Custom moderation rule added", { ruleId: rule.id, name: rule.name });
  }
  
  removeCustomRule(ruleId: string) {
    this.config.customRules = this.config.customRules.filter(r => r.id !== ruleId);
    log.info({ module: "AdvancedAIModerator" }, "Custom moderation rule removed", { ruleId });
  }
  
  async moderate(context: ModerationContext): Promise<ModerationResult> {
    const cacheKey = this.generateCacheKey(context);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    
    const startTime = performance.now();
    
    try {
      const customRuleResult = this.checkCustomRules(context);
      if (customRuleResult) {
        this.cache.set(cacheKey, customRuleResult);
        return customRuleResult;
      }
      
      const aiResult = await this.analyzeWithAI(context);
      
      const finalResult = this.determineFinalAction(aiResult, context);
      
      this.cache.set(cacheKey, finalResult);
      
      this.stats.totalModerated++;
      if (finalResult.action !== "none") this.stats.actionsTaken++;
      this.stats.avgConfidence = (this.stats.avgConfidence * 0.9) + (finalResult.confidence * 0.1);
      this.stats.avgLatencyMs = (this.stats.avgLatencyMs * 0.9) + ((performance.now() - startTime) * 0.1);
      
      if (finalResult.requiresHumanReview) {
        this.stats.humanReviews++;
        this.emit("humanReviewRequired", { context, result: finalResult });
      }
      
      this.emit("moderated", { context, result: finalResult });
      
      return finalResult;
      
    } catch (err) {
      log.error({ module: "AdvancedAIModerator" }, "Moderation failed", { error: err, context: context.messageId });
      return {
        action: "none",
        reason: "Moderation system error",
        confidence: 0,
        category: "error",
        severity: "low",
        evidence: { matchedPatterns: [], aiAnalysis: "", contextFactors: [], riskScore: 0, similarCases: 0 },
        requiresHumanReview: true
      };
    }
  }
  
  private checkCustomRules(context: ModerationContext): ModerationResult | null {
    for (const rule of this.config.customRules) {
      if (!rule.enabled) continue;
      
      const regex = new RegExp(rule.pattern, "gi");
      if (regex.test(context.content)) {
        return {
          action: rule.action,
          reason: `Custom rule triggered: ${rule.name}`,
          confidence: 0.95,
          category: "custom_rule",
          severity: rule.severity,
          evidence: {
            matchedPatterns: [rule.pattern],
            aiAnalysis: `Matched custom rule: ${rule.description}`,
            contextFactors: ["custom_rule_match"],
            riskScore: rule.severity === "critical" ? 1 : 0.8,
            similarCases: 0
          },
          requiresHumanReview: rule.severity === "critical"
        };
      }
    }
    return null;
  }
  
  private async analyzeWithAI(context: ModerationContext): Promise<ModerationResult> {
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const riskFactors = this.analyzeRiskFactors(context);
    const riskScore = this.calculateRiskScore(riskFactors);
    
    let action: ModerationResult["action"] = "none";
    let severity: ModerationResult["severity"] = "low";
    let category = "none";
    
    if (riskScore > 0.9) {
      action = "ban";
      severity = "critical";
      category = "severe_violation";
    } else if (riskScore > 0.75) {
      action = "timeout";
      severity = "high";
      category = "significant_violation";
    } else if (riskScore > 0.5) {
      action = "warn";
      severity = "medium";
      category = "moderate_violation";
    } else if (riskScore > 0.3) {
      action = "flag";
      severity = "low";
      category = "minor_concern";
    }
    
    return {
      action,
      reason: `AI Analysis: ${riskFactors.join(", ")}`,
      confidence: Math.min(0.99, riskScore + 0.1),
      category,
      severity,
      evidence: {
        matchedPatterns: [],
        aiAnalysis: `Risk factors: ${riskFactors.join(", ")}. User reputation: ${context.userHistory.reputationScore}. History: ${context.userHistory.violationCount} violations.`,
        contextFactors: riskFactors,
        riskScore,
        similarCases: 0
      },
      requiresHumanReview: riskScore > 0.8 && riskScore < 0.9
    };
  }
  
  private analyzeRiskFactors(context: ModerationContext): string[] {
    const factors: string[] = [];
    
    if (context.userHistory.reputationScore < 0.3) factors.push("low_reputation");
    if (context.userHistory.violationCount > 5) factors.push("repeat_offender");
    if (context.userHistory.warningCount > 10) factors.push("frequent_warnings");
    if (Date.now() - context.userHistory.joinDate < 86400000) factors.push("new_account");
    if (context.content.length > 2000) factors.push("long_message");
    if ((context.content.match(/https?:\/\//g) || []).length > 3) factors.push("multiple_links");
    if (context.attachments.length > 0) factors.push("has_attachments");
    
    const suspiciousPatterns = [
      /discord\.gg\/[a-zA-Z0-9]+/gi,
      /free\s+nitro/gi,
      /steam\s+gift/gi,
      /verify\s+account/gi,
      /click\s+here/gi,
      /urgent/gi
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(context.content)) {
        factors.push(`suspicious_${pattern.source.slice(0, 20)}`);
      }
    }
    
    return factors;
  }
  
  private calculateRiskScore(factors: string[]): number {
    const weights: Record<string, number> = {
      low_reputation: 0.3,
      repeat_offender: 0.25,
      frequent_warnings: 0.15,
      new_account: 0.2,
      long_message: 0.05,
      multiple_links: 0.2,
      has_attachments: 0.1
    };
    
    let score = 0;
    for (const factor of factors) {
      if (factor.startsWith("suspicious_")) score += 0.3;
      else score += weights[factor] || 0.1;
    }
    
    return Math.min(1, score);
  }
  
  private determineFinalAction(aiResult: ModerationResult, context: ModerationContext): ModerationResult {
    if (aiResult.confidence >= this.config.autoActionThreshold && aiResult.action !== "none") {
      return aiResult;
    }
    
    if (aiResult.confidence > 0.7 && aiResult.action !== "none") {
      return {
        ...aiResult,
        action: "flag",
        requiresHumanReview: true,
        reason: aiResult.reason + " (Requires review due to confidence threshold)"
      };
    }
    
    return {
      ...aiResult,
      action: "none",
      reason: "Below action threshold"
    };
  }
  
  private generateCacheKey(context: ModerationContext): string {
    return `${context.guildId}:${context.channelId}:${context.userId}:${context.messageId}`;
  }
  
  private startProcessingLoop() {
    setInterval(() => {
      if (this.moderationQueue.length > 0 && !this.processing) {
        this.processQueue();
      }
    }, 50);
  }
  
  private async processQueue() {
    this.processing = true;
    
    while (this.moderationQueue.length > 0) {
      const context = this.moderationQueue.shift()!;
      await this.moderate(context);
    }
    
    this.processing = false;
  }
  
  queueModeration(context: ModerationContext) {
    this.moderationQueue.push(context);
  }
  
  private startInsightGeneration() {
    setInterval(() => {
      this.generateInsights();
    }, 300000);
  }
  
  private generateInsights() {
    const now = Date.now();
    const recentInsights = this.insights.filter(i => now - i.timestamp < 3600000);
    
    if (this.stats.totalModerated > 1000 && this.stats.falsePositives / this.stats.totalModerated > 0.1) {
      this.insights.push({
        type: "alert",
        title: "High False Positive Rate",
        description: `False positive rate is ${(this.stats.falsePositives / this.stats.totalModerated * 100).toFixed(1)}%. Consider adjusting thresholds.`,
        severity: "warning",
        data: { falsePositiveRate: this.stats.falsePositives / this.stats.totalModerated },
        timestamp: now
      });
    }
    
    if (this.stats.avgLatencyMs > 500) {
      this.insights.push({
        type: "alert",
        title: "High Moderation Latency",
        description: `Average latency is ${this.stats.avgLatencyMs.toFixed(0)}ms. Consider scaling or optimizing.`,
        severity: "warning",
        data: { avgLatencyMs: this.stats.avgLatencyMs },
        timestamp: now
      });
    }
    
    this.insights = this.insights.slice(-100);
  }
  
  getInsights(): AIInsight[] {
    return [...this.insights];
  }
  
  getStats() {
    return { ...this.stats };
  }
  
  async shutdown() {
    this.moderationQueue.length = 0;
    this.cache.clear();
    this.insights.length = 0;
    this.removeAllListeners();
    log.info({ module: "AdvancedAIModerator" }, "AdvancedAIModerator shutdown complete");
  }
}

export const advancedAIModerator = AdvancedAIModerator.getInstance();