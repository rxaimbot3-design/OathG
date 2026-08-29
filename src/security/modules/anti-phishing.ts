import { Message } from "discord.js";

export interface AntiPhishingConfig {
  knownPhishingDomains?: string[];
  phishingPatterns?: RegExp[];
}

export class AntiPhishing {
  private static instance: AntiPhishing;
  private knownPhishingDomains: string[];
  private phishingPatterns: RegExp[];

  private constructor(config: AntiPhishingConfig = {}) {
    this.knownPhishingDomains = config.knownPhishingDomains ?? [
      "discord-nitro.gift", "steam-free.com", "discord-app.net", "discode.gift",
      "dlscord.gift", "discoord.gift", "discord-nitro.click", "discord-app.info",
      "discord-gift.xyz", "free-nitro.ru", "steam-nitro.com", "discorb.gift",
      "discord-claim.com", "discord-drop.info", "nitro-discord.xyz", "discord-app.gift",
      "steamcommunity-free.com", "roblox-robux-free.com", "discord-gift-claim.ru"
    ];

    this.phishingPatterns = config.phishingPatterns ?? [
      /(discord|dlscord|discoord|discorb|discud|dlscord-app)\.(gift|click|xyz|top|ru|tk|ml|info|app|net|link)/i,
      /(free|claim|drop|steam)-?(nitro|gift|discord|steam)\.(com|xyz|top|ru|click|gift|info|link)/i,
      /https?:\/\/(www\.)?(steamcommunity|discord)-[a-z0-9-]+\.(xyz|top|ru|click|gift|info|link)/i,
      /https?:\/\/[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}(\/.*)?/i
    ];
  }

  static getInstance(config?: AntiPhishingConfig): AntiPhishing {
    if (!AntiPhishing.instance) {
      AntiPhishing.instance = new AntiPhishing(config);
    }
    return AntiPhishing.instance;
  }

  static resetInstance(): void {
    AntiPhishing.instance = undefined as any;
  }

  isPhishing(content: string): boolean {
    if (!content) return false;
    const lower = content.toLowerCase();
    if (this.knownPhishingDomains.some(domain => lower.includes(domain))) return true;
    return this.phishingPatterns.some(pattern => pattern.test(lower));
  }

  async scanMessage(message: Message): Promise<boolean> {
    if (this.isPhishing(message.content)) {
      await message.delete().catch(() => {});
      if (message.channel.isTextBased() && 'send' in message.channel) {
        await message.channel.send(`🚨 **Anti-Phishing Triggered:** Deleted a malicious phishing link sent by <@${message.author.id}>.`);
      }
      return true;
    }
    return false;
  }

  addDomain(domain: string): void {
    if (!this.knownPhishingDomains.includes(domain)) {
      this.knownPhishingDomains.push(domain);
    }
  }

  addPattern(pattern: RegExp): void {
    this.phishingPatterns.push(pattern);
  }
}

export interface EnvScannerConfig {
  tokenEnvVars?: string[];
  minTokenLength?: number;
}

export class EnvScanner {
  private static instance: EnvScanner;
  private tokenEnvVars: string[];
  private minTokenLength: number;

  private constructor(config: EnvScannerConfig = {}) {
    this.tokenEnvVars = config.tokenEnvVars ?? ["DISCORD_BOT_TOKEN", "DISCORD_TOKEN"];
    this.minTokenLength = config.minTokenLength ?? 50;
  }

  static getInstance(config?: EnvScannerConfig): EnvScanner {
    if (!EnvScanner.instance) {
      EnvScanner.instance = new EnvScanner(config);
    }
    return EnvScanner.instance;
  }

  static resetInstance(): void {
    EnvScanner.instance = undefined as any;
  }

  scan(): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    let valid = false;

    for (const envVar of this.tokenEnvVars) {
      const token = process.env[envVar];
      if (!token || token.length < this.minTokenLength) {
        warnings.push(`⚠️ ENV SCANNER: ${envVar} is missing or looks invalid!`);
      } else if (typeof token === "string" && token.length >= this.minTokenLength && token.includes(".")) {
        console.log(`✅ ENV SCANNER: Valid bot token format detected in ${envVar}.`);
        valid = true;
      }
    }

    return { valid, warnings };
  }
}