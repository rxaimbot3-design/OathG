import { GoogleGenAI } from "@google/genai";
import { TtlMap } from "../MapManager.js";
import { aiServiceMonitor } from "../../core/ai-service-monitor.js";

export interface AIDeepScanConfig {
  apiKey?: string;
  model?: string;
  cooldownUserMs?: number;
  cooldownChannelMs?: number;
  maxEntries?: number;
}

export class AIDeepScan {
  private static instance: AIDeepScan;
  private lastScanTimes: TtlMap<string, number>;
  private config: Required<AIDeepScanConfig>;
  private readonly AI_QUOTA_WARNING = "AI Quota limit reached in SecurityFeatures.";

  private constructor(config: AIDeepScanConfig = {}) {
    this.config = {
      apiKey: config.apiKey ?? process.env.GEMINI_API_KEY,
      model: config.model ?? "gemini-1.5-flash",
      cooldownUserMs: config.cooldownUserMs ?? 10000,
      cooldownChannelMs: config.cooldownChannelMs ?? 5000,
      maxEntries: config.maxEntries ?? 5000,
    };
    this.lastScanTimes = new TtlMap<string, number>({
      ttlMs: 5 * 60 * 1000,
      maxEntries: this.config.maxEntries,
      autoCleanupMs: 60000,
    });
  }

  static getInstance(config?: AIDeepScanConfig): AIDeepScan {
    if (!AIDeepScan.instance) {
      AIDeepScan.instance = new AIDeepScan(config);
    }
    return AIDeepScan.instance;
  }

  static resetInstance(): void {
    AIDeepScan.instance = undefined as any;
  }

  async analyzeMessage(messageContent: string, userId: string = "global", channelId: string = "global"): Promise<number> {
    if (!messageContent) return 0;
    if (!this.config.apiKey) {
      console.warn("[AI DeepScan] GEMINI_API_KEY missing. Using heuristic fallback.");
      return this.heuristicFallback(messageContent);
    }

    const now = Date.now();
    const userKey = `u:${userId}`;
    const channelKey = `c:${channelId}`;

    const lastUserScan = this.lastScanTimes.get(userKey) || 0;
    const lastChannelScan = this.lastScanTimes.get(channelKey) || 0;

    const hasRaidKeywords = /(raid|nuke|attack|hack|bypass|alt|bot|invite|spam|mass|ban|kick|ping|admin|token|owner|payload|infect|crash)/i.test(messageContent);
    if (!hasRaidKeywords) {
      return 0;
    }

    if (now - lastUserScan < this.config.cooldownUserMs || now - lastChannelScan < this.config.cooldownChannelMs) {
      return 0;
    }

    this.lastScanTimes.set(userKey, now);
    this.lastScanTimes.set(channelKey, now);

    try {
      const ai = new GoogleGenAI({ apiKey: this.config.apiKey });
      const response = await ai.models.generateContent({
        model: this.config.model,
        contents: `Analyze this message for Discord raid planning, social engineering, or severe toxic threat. Return ONLY a number from 0 to 100 representing threat level. Message: "${messageContent}"`,
      });
      const text = response.text || "0";
      const numberMatch = text.match(/\d+/);
      const score = numberMatch ? parseInt(numberMatch[0]) : 0;
      
      aiServiceMonitor.recordCall(true);
      
      return isNaN(score) ? 0 : score;
    } catch (error: any) {
      const errStr = String(error?.message || error).toLowerCase();
      
      aiServiceMonitor.recordCall(false, error?.message || String(error));
      
      if (errStr.includes("quota") || errStr.includes("resource_exhausted") || errStr.includes("429") || errStr.includes("exceeded")) {
        console.warn(this.AI_QUOTA_WARNING);
      }
      console.error("AI Scan Error:", error);
      return this.heuristicFallback(messageContent);
    }
  }

  private heuristicFallback(messageContent: string): number {
    const hasRaidKeywords = /(raid|nuke|attack|hack|bypass|alt|bot|invite|spam|mass|ban|kick|ping|admin|token|owner|payload|infect|crash)/i.test(messageContent);
    return hasRaidKeywords ? 40 : 5;
  }

  getStats() {
    return {
      scanTimesTracked: this.lastScanTimes.size,
      hasApiKey: !!this.config.apiKey,
    };
  }

  clear(): void {
    this.lastScanTimes.clear();
  }
}