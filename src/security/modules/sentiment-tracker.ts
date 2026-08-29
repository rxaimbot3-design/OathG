import { Message, Guild } from "discord.js";
import { GoogleGenAI } from "@google/genai";
import { TtlMap } from "../MapManager.js";
import { TokenVault } from "./token-vault.js";
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
}

export class SentimentTracker {
  private static instance: SentimentTracker;
  private serverScores: TtlMap<string, number>;
  private lastScanTimes: TtlMap<string, number>;
  private lockedChannels: TtlMap<string, NodeJS.Timeout>;
  private config: Required<SentimentTrackerConfig>;
  private readonly AI_QUOTA_WARNING = "AI Quota limit reached in SecurityFeatures.";

  private constructor(config: SentimentTrackerConfig = {}) {
    this.config = {
      apiKey: config.apiKey ?? process.env.GEMINI_API_KEY,
      model: config.model ?? "gemini-1.5-flash",
      cooldownUserMs: config.cooldownUserMs ?? 15000,
      cooldownChannelMs: config.cooldownChannelMs ?? 10000,
      maxEntries: config.maxEntries ?? 5000,
      lockDurationMs: config.lockDurationMs ?? 600000,
    };
    this.serverScores = new TtlMap<string, number>({
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
  }

  static getInstance(config?: SentimentTrackerConfig): SentimentTracker {
    if (!SentimentTracker.instance) {
      SentimentTracker.instance = new SentimentTracker(config);
    }
    return SentimentTracker.instance;
  }

  static resetInstance(): void {
    SentimentTracker.instance = undefined as any;
  }

  async analyzeMessage(message: Message, alertCallback: (msg: string) => void): Promise<void> {
    if (message.author.bot || !message.guild || !message.content) return;

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
      apiKey = TokenVault.getInstance().retrieve("GEMINI_API_KEY");
    } catch (e: any) {
      const errStr = String(e?.message || e).toLowerCase();
      if (errStr.includes("quota") || errStr.includes("resource_exhausted") || errStr.includes("429") || errStr.includes("exceeded")) {
        console.warn(this.AI_QUOTA_WARNING);
      }
      apiKey = this.config.apiKey;
    }
    
    if (!apiKey) {
      console.warn("[SentimentTracker] GEMINI_API_KEY missing. Applying heuristic fallback.");
      const currentScore = this.serverScores.get(message.guild.id) || 100;
      const newScore = isSuspicious ? Math.max(0, currentScore - 10) : currentScore;
      this.serverScores.set(message.guild.id, newScore);
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
      
      const currentScore = this.serverScores.get(message.guild.id) || 100;
      let newScore = currentScore;
      
      if (result.isScam || result.sentimentScore < 20) {
        newScore = Math.max(0, currentScore - 20);
        if (newScore < 30) {
          await this.lockChannel(message.guild, message.channel, alertCallback);
        }
      } else if (result.sentimentScore > 70) {
        newScore = Math.min(100, currentScore + 5);
      }
      
      this.serverScores.set(message.guild.id, newScore);
    } catch (err: any) {
      const errStr = String(err?.message || err).toLowerCase();
      if (errStr.includes("quota") || errStr.includes("resource_exhausted") || errStr.includes("429") || errStr.includes("exceeded")) {
        console.warn(this.AI_QUOTA_WARNING);
      }
      console.error("[SentimentTracker] AI analysis failed. Applying heuristic fallback.", err);
      const currentScore = this.serverScores.get(message.guild.id) || 100;
      const newScore = isSuspicious ? Math.max(0, currentScore - 10) : currentScore;
      this.serverScores.set(message.guild.id, newScore);
      if (isSuspicious) {
        alertCallback(`⚠️ AI Sentiment analysis unavailable. Suspicious message detected by heuristic.`);
      }
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
      await channel.send("🔒 **Channel Locked** by AI Sentiment Tracker due to highly toxic or malicious activity.");

      const timeoutId = setTimeout(async () => {
        try {
          const chan = await guild.channels.fetch(chanId).catch(() => null);
          if (chan && 'permissionOverwrites' in chan) {
            await (chan as any).permissionOverwrites.edit(guild.roles.everyone, {
              SendMessages: null,
            });
            await (chan as any).send("🔓 **Channel Unlocked** automatically after 10-minute cooldown. Please keep the chat clean!");
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
    return this.serverScores.get(guildId) || 100;
  }

  getAllScores(): Map<string, number> {
    const result = new Map<string, number>();
    this.serverScores.forEach((score, guildId) => {
      result.set(guildId, score);
    });
    return result;
  }

  getLockedChannels(): string[] {
    return Array.from(this.lockedChannels.keys());
  }

  clear(): void {
    this.serverScores.clear();
    this.lastScanTimes.clear();
    for (const timeout of this.lockedChannels.values()) {
      clearTimeout(timeout);
    }
    this.lockedChannels.clear();
  }
}