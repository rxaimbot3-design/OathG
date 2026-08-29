import { Guild } from "discord.js";

export interface ScanResult {
  scanned: number;
  threatsFound: number;
}

export interface OAuthMaliciousAppDetectorConfig {
  suspiciousPatterns?: string[];
}

export class OAuthMaliciousAppDetector {
  private static instance: OAuthMaliciousAppDetector;
  private suspiciousPatterns: string[];

  private constructor(config: OAuthMaliciousAppDetectorConfig = {}) {
    this.suspiciousPatterns = config.suspiciousPatterns ?? [
      "free nitro",
      "token grabber",
      "ip logger",
      "selfbot",
      "nuke bot",
      "no mercy nuke",
      "token stealer"
    ];
  }

  static getInstance(config?: OAuthMaliciousAppDetectorConfig): OAuthMaliciousAppDetector {
    if (!OAuthMaliciousAppDetector.instance) {
      OAuthMaliciousAppDetector.instance = new OAuthMaliciousAppDetector(config);
    }
    return OAuthMaliciousAppDetector.instance;
  }

  static resetInstance(): void {
    OAuthMaliciousAppDetector.instance = undefined as any;
  }

  async scanGuildIntegrations(guild: Guild, alertCallback: (msg: string) => void): Promise<ScanResult> {
    try {
      const integrations = await guild.fetchIntegrations().catch(() => null);
      if (!integrations) return { scanned: 0, threatsFound: 0 };
      
      const integrationArray = Array.from(integrations.values());
      const results = await Promise.all(integrationArray.map(async (integration: any) => {
        const name = integration.name.toLowerCase();
        if (this.suspiciousPatterns.some(pattern => name.includes(pattern))) {
          alertCallback(`🚨 [OAUTH MALICIOUS APP] Detected suspicious integration '${integration.name}' (ID: ${integration.id}) in **${guild.name}**! Executing instant deletion...`);
          await integration.delete("Zero Trust Anti-Nuke: Malicious OAuth2 App Detected").catch(() => {});
          return true;
        }
        return false;
      }));

      const threats = results.filter(Boolean).length;
      return { scanned: integrations.size, threatsFound: threats };
    } catch (err: any) {
      console.error("[OAUTH MALICIOUS APP] Error scanning integrations:", err);
      return { scanned: 0, threatsFound: 0 };
    }
  }

  addSuspiciousPattern(pattern: string): void {
    if (!this.suspiciousPatterns.includes(pattern.toLowerCase())) {
      this.suspiciousPatterns.push(pattern.toLowerCase());
    }
  }

  getPatterns(): string[] {
    return [...this.suspiciousPatterns];
  }

  // Static wrapper methods for backward compatibility
  static async scanGuildIntegrations(guild: Guild, alertCallback: (msg: string) => void): Promise<ScanResult> {
    return this.getInstance().scanGuildIntegrations(guild, alertCallback);
  }

  static addSuspiciousPattern(pattern: string): void {
    return this.getInstance().addSuspiciousPattern(pattern);
  }

  static getPatterns(): string[] {
    return this.getInstance().getPatterns();
  }
}