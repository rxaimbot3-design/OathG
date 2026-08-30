/**
 * SentimentTracker - AI-powered sentiment analysis with Redis persistence
 * 
 * Features:
 * - Google Gemini integration for sentiment analysis
 * - Per-server sentiment scores
 * - Automatic channel locking on toxicity
 * - Redis persistence for scores and locked channels
 * - Configurable cooldowns and thresholds
 */

import { Message, Guild, TextChannel } from "discord.js";
import { GoogleGenAI } from "@google/genai";
import { TtlMap } from "../MapManager.js";
import { TokenVault } from "./token-vault.js";
import { RedisPersistence } from "./redis-persistence.js";
import { aiServiceMonitor } from "../../core/ai-service-monitor.js";

export interface SentimentResult {
  sentimentScore: number;
  isScam: boolean;
}

export interface SentimentTrackerConfig {
  apiKey?: string;
  model?: string;
  cooldownUserMs?: number;
  cooldownChannelMs?: number;
  maxEntries?: number;
  lockDurationMs?: number;
  keyPrefix?: string;
}

interface ServerSentimentData {
  score: number;
  lastUpdated: number;
  messageCount: number;
}

export class SentimentTracker {
  private static instance: SentimentTracker;
  private serverScores: TtlMap<string, ServerSentimentData>;
  private lastScanTimes: TtlMap<string, number>;
  private lockedChannels: TtlMap<string, NodeJS.Timeout>;
  private config: Required<SentimentTrackerConfig>;
  private persistence: RedisPersistence;
  private initialized = false;
  private readonly AI_QUOTA_WARNING = "AI Quota limit reached in SecurityFeatures.";

  private constructor(config: SentimentTrackerConfig = {}) {
    this.config = {
      apiKey: config.apiKey ?? process.env.GEMINI_API_KEY ?? "",
      model: config.model ?? "gemini-1.5-flash",
      cooldownUserMs: config.cooldownUserMs ?? 15000,
      cooldownChannelMs: config.cooldownChannelMs ?? 10000,
      maxEntries: config.maxEntries ?? 5000,
      lockDurationMs: config.lockDurationMs ?? 600000,
      keyPrefix: config.keyPrefix ?? "sentiment:",
    };
    this.serverScores = new TtlMap<string, ServerSentimentData>({
      ttlMs: 30 * 60 * 1000,
      maxEntries: 1000,
      autoCleanupMs: 120000,
    });
    this.lastScanTimes = new TtlMap<string, number>({
      ttlMs: 5 * 60 * 1000,
      maxEntries: this.config.maxEntries,
      autoCleanupMs: 60000,
    });
    this.lockedChannels = new TtlMap<string, NodeJS.Timeout>({
      ttlMs: 10 * 60 * 1000,
      maxEntries: 500,
      autoCleanupMs: 60000,
    });
    this.persistence = RedisPersistence.getInstance();
  }

  static getInstance(config?: SentimentTrackerConfig): SentimentTracker {
    if (!SentimentTracker.instance) {
      SentimentTracker.instance = new SentimentTracker(config);
    }
    return SentimentTracker.instance;
  }

  static resetInstance(): void {
    if (SentimentTracker.instance) {
      SentimentTracker.instance.cleanup();
    }
    SentimentTracker.instance = undefined as any;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.persistence.connect();
    await this.loadFromPersistence();
    this.initialized = true;
  }

  private async loadFromPersistence(): Promise<void> {
    try {
      const keys = await this.persistence.keys(`${this.config.keyPrefix}server:*`);
      for (const key of keys) {
        const data = await this.persistence.get<ServerSentimentData>(key);
        if (data) {
          const guildId = key.replace(`${this.config.keyPrefix}server:`, "");
          this.serverScores.set(guildId, data);
        }
      }
      console.log(`[SentimentTracker] Loaded ${this.serverScores.size} server sentiment scores from Redis`);
    } catch (err) {
      console.warn("[SentimentTracker] Failed to load from persistence:", (err as Error).message);
    }
  }

  private async persistServer(guildId: string, data: ServerSentimentData): Promise<void> {
    try {
      await this.persistence.set(`${this.config.keyPrefix}server:${guildId}`, data, 30 * 60 * 1000);
    } catch (err) {
      console.warn("[SentimentTracker] Failed to persist server:", (err as Error).message);
    }
  }

  async analyzeMessage(message: Message, alertCallback: (msg: string) => void): Promise<void> {
    if (message.author.bot || !message.guild || !message.content) return;

    if (!this.initialized) await this.initialize();

    const now = Date.now();
    const userKey = `u:${message.author.id}`;
    const channelKey = `c:${message.channel.id}`;

    const lastUserScan = this.lastScanTimes.get(userKey) || 0;
    const lastChannelScan = this.lastScanTimes.get(channelKey) || 0;

    const isSuspicious = /(porn|nudes?|sex|onlyfans|free\s*nitro|steam\s*gift|discord\s*nitro\s*free|hack|token\s*grabber|ip\s*logger|xxx|nuke|raid|scam|bypass|attack|kill|fuck|bitch|shit|retard|idiot|asshole)/i.test(message.content);

    const userCooldown = isSuspicious ? 2000 : this.config.cooldownUserMs;
    const channelCooldown = isSuspicious ? 1000 : this.config.cooldownChannelMs;

    if (now - lastUserScan < userCooldown || now - lastChannelScan < channelCooldown) {
      return;
    }

    if (!isSuspicious && message.content.length < 25) return;

    this.lastScanTimes.set(userKey, now);
    this.lastScanTimes.set(channelKey, now);

    let apiKey = this.config.apiKey;
    try {
      apiKey = await TokenVault.retrieve("GEMINI_API_KEY");
    } catch (e: any) {
      const errStr = String(e?.message || e).toLowerCase();
      if (errStr.includes("quota") || errStr.includes("resource_exhausted") || errStr.includes("429") || errStr.includes("exceeded")) {
        console.warn(this.AI_QUOTA_WARNING);
      }
      apiKey = this.config.apiKey;
    }

    if (!apiKey) {
      console.warn("[SentimentTracker] GEMINI_API_KEY missing. Applying heuristic fallback.");
      const currentData = this.serverScores.get(message.guild.id) || { score: 100, lastUpdated: now, messageCount: 0 };
      const newScore = isSuspicious ? Math.max(0, currentData.score - 10) : currentData.score;
      currentData.score = newScore;
      currentData.lastUpdated = now;
      currentData.messageCount++;
      this.serverScores.set(message.guild.id, currentData);
      await this.persistServer(message.guild.id, currentData);
      if (isSuspicious) {
        alertCallback(`⚠️ AI Sentiment analysis unavailable. Suspicious message detected by heuristic.`);
      }
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Analyze this Discord message for sentiment, toxicity, and scam links. 
Return ONLY a JSON object with this exact format:
{"sentimentScore": <number from 0 to 100, 100 is extremely positive, 0 is extremely toxic/scam>, "isScam": <boolean>}
Message: "${message.content}"`;

      const response = await ai.models.generateContent({
        model: this.config.model,
        contents: prompt,
      });

      let text = response.text || "{}";
      const jsonMatch = text.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        text = jsonMatch[0];
      }

      let result: SentimentResult;
      try {
        result = JSON.parse(text);
      } catch (jsonErr) {
        const sentimentMatch = text.match(/"sentimentScore":\s*(\d+)/);
        const isScamMatch = text.match(/"isScam":\s*(true|false)/);
        result = {
          sentimentScore: sentimentMatch ? parseInt(sentimentMatch[1]) : 50,
          isScam: isScamMatch ? isScamMatch[1] === "true" : false,
        };
      }

      const currentData = this.serverScores.get(message.guild.id) || { score: 100, lastUpdated: now, messageCount: 0 };
      let newScore = currentData.score;

      if (result.isScam || result.sentimentScore < 20) {
        newScore = Math.max(0, currentData.score - 20);
        if (newScore < 30) {
          await this.lockChannel(message.guild, message.channel, alertCallback);
        }
      } else if (result.sentimentScore > 70) {
        newScore = Math.min(100, currentData.score + 5);
      }

      currentData.score = newScore;
      currentData.lastUpdated = now;
      currentData.messageCount++;
      this.serverScores.set(message.guild.id, currentData);
      await this.persistServer(message.guild.id, currentData);

      aiServiceMonitor.recordCall(true);
    } catch (err: any) {
      const errStr = String(err?.message || err).toLowerCase();
      if (errStr.includes("quota") || errStr.includes("resource_exhausted") || errStr.includes("429") || errStr.includes("exceeded")) {
        console.warn(this.AI_QUOTA_WARNING);
      }
      console.error("[SentimentTracker] AI analysis failed. Applying heuristic fallback.", err);
      const currentData = this.serverScores.get(message.guild.id) || { score: 100, lastUpdated: now, messageCount: 0 };
      const newScore = isSuspicious ? Math.max(0, currentData.score - 10) : currentData.score;
      currentData.score = newScore;
      currentData.lastUpdated = now;
      currentData.messageCount++;
      this.serverScores.set(message.guild.id, currentData);
      await this.persistServer(message.guild.id, currentData);
      if (isSuspicious) {
        alertCallback(`⚠️ AI Sentiment analysis unavailable. Suspicious message detected by heuristic.`);
      }
      aiServiceMonitor.recordCall(false, err?.message || String(err));
    }
  }

  private async lockChannel(guild: Guild, channel: any, alertCallback: (msg: string) => void): Promise<void> {
    if (!channel || !('permissionOverwrites' in channel)) return;

    const chanId = channel.id;
    if (this.lockedChannels.has(chanId)) {
      clearTimeout(this.lockedChannels.get(chanId)!);
    }

    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: false,
      });
      alertCallback(`🚨 **SERVER MOOD CRITICAL** 🚨\nChannel <#${chanId}> locked down in **${guild.name}** due to extreme toxicity or scam outbreak.`);
      if (channel.send) {
        await channel.send("🔒 **Channel Locked** by AI Sentiment Tracker due to highly toxic or malicious activity.");
      }

      const timeoutId = setTimeout(async () => {
        try {
          const chan = await guild.channels.fetch(chanId).catch(() => null);
          if (chan && 'permissionOverwrites' in chan) {
            await (chan as any).permissionOverwrites.edit(guild.roles.everyone, {
              SendMessages: null,
            });
            if ((chan as any).send) {
              await (chan as any).send("🔓 **Channel Unlocked** automatically after 10-minute cooldown. Please keep the chat clean!");
            }
          }
        } catch (err) {
          console.error("Failed to auto-unlock channel:", err);
        } finally {
          this.lockedChannels.delete(chanId);
        }
      }, this.config.lockDurationMs);
      this.lockedChannels.set(chanId, timeoutId);
    } catch (err) {
      console.error("Failed to lock channel:", err);
    }
  }

  getServerScore(guildId: string): number {
    return this.serverScores.get(guildId)?.score ?? 100;
  }

  getServerData(guildId: string): ServerSentimentData | null {
    return this.serverScores.get(guildId) ?? null;
  }

  getAllScores(): Map<string, number> {
    const result = new Map<string, number>();
    this.serverScores.forEach((data, guildId) => {
      result.set(guildId, data.score);
    });
    return result;
  }

  getAllServerData(): Map<string, ServerSentimentData> {
    const result = new Map<string, ServerSentimentData>();
    this.serverScores.forEach((data, guildId) => {
      result.set(guildId, data);
    });
    return result;
  }

  getLockedChannels(): string[] {
    return Array.from(this.lockedChannels.keys());
  }

  getStats() {
    return {
      serversTracked: this.serverScores.size,
      lockedChannels: this.lockedChannels.size,
      scanTimesTracked: this.lastScanTimes.size,
      hasApiKey: !!this.config.apiKey,
      redisConnected: this.persistence.getConnectionStatus().connected,
    };
  }

  async clear(): Promise<void> {
    this.serverScores.clear();
    this.lastScanTimes.clear();
    for (const timeout of this.lockedChannels.values()) {
      clearTimeout(timeout);
    }
    this.lockedChannels.clear();
    const keys = await this.persistence.keys(`${this.config.keyPrefix}*`);
    for (const key of keys) {
      await this.persistence.del(key);
    }
  }

  private cleanup(): void {
    for (const timeout of this.lockedChannels.values()) {
      clearTimeout(timeout);
    }
    this.lockedChannels.clear();
  }

  // Static wrapper methods for backward compatibility
  static async analyzeMessage(message: Message, alertCallback: (msg: string) => void): Promise<void> {
    return this.getInstance().analyzeMessage(message, alertCallback);
  }

  static getServerScore(guildId: string): number {
    return this.getInstance().getServerScore(guildId);
  }

  static getAllScores(): Map<string, number> {
    return this.getInstance().getAllScores();
  }

  static getLockedChannels(): string[] {
    return this.getInstance().getLockedChannels();
  }

  static getStats() {
    return this.getInstance().getStats();
  }

  static async clear(): Promise<void> {
    return this.getInstance().clear();
  }
}