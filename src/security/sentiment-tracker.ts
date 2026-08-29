/**
 * SentimentTracker - AI-powered sentiment analysis for Discord messages.
 * Instance-based implementation for use with GuildContext.
 */

import type { SecurityModule } from "../core/interfaces/SecurityModule";
import type { Message } from "discord.js";

export class SentimentTrackerInstance implements SecurityModule {
  readonly name = "sentimentTracker";
  private serverScores = new Map<string, number>();
  private lastScanTimes = new Map<string, number>();

  init(): void {
    // Nothing to initialize
  }

  async analyzeMessage(message: Message, alertCallback: (msg: string) => void): Promise<void> {
    if (message.author.bot || !message.guild || !message.content) return;

    const now = Date.now();
    const userKey = `u:${message.author.id}`;
    const channelKey = `c:${message.channel.id}`;

    // Cooldown checks
    const lastUserScan = this.lastScanTimes.get(userKey) || 0;
    const lastChannelScan = this.lastScanTimes.get(channelKey) || 0;

    if (now - lastUserScan < 30000 && now - lastChannelScan < 10000) {
      return; // Skip due to cooldown
    }

    this.lastScanTimes.set(userKey, now);
    this.lastScanTimes.set(channelKey, now);

    // Heuristic-based analysis (AI can be plugged in later)
    const lower = message.content.toLowerCase();
    const suspiciousKeywords = /raid|nuke|attack|hack|bypass|alt|bot|invite|spam|mass|ban|kick|ping|admin|token|owner|payload|infect|crash/i;
    const isSuspicious = suspiciousKeywords.test(lower);

    const currentScore = this.serverScores.get(message.guild.id) || 100;
    let newScore = currentScore;

    if (isSuspicious) {
      newScore = Math.max(0, currentScore - 5);
      if (newScore < 70) {
        alertCallback(`⚠️ Suspicious message detected in ${message.guild.name}. Server sentiment score: ${newScore}`);
      }
    } else {
      newScore = Math.min(100, currentScore + 1);
    }

    this.serverScores.set(message.guild.id, newScore);
  }

  getServerScore(guildId: string): number {
    return this.serverScores.get(guildId) ?? 100;
  }

  setServerScore(guildId: string, score: number): void {
    this.serverScores.set(guildId, Math.max(0, Math.min(100, score)));
  }
}

/**
 * Global singleton instance (backwards compatibility).
 * @deprecated Use GuildContext.getSentimentTracker() instead.
 */
export const SentimentTracker = new SentimentTrackerInstance();
