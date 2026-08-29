/**
 * OAuthMaliciousAppDetector - Scans guild OAuth integrations for malicious apps.
 * Instance-based implementation for use with GuildContext.
 */

import type { SecurityModule } from "../core/interfaces/SecurityModule";
import type { Guild } from "discord.js";

const SUSPICIOUS_PATTERNS = [
  "free nitro",
  "token grabber",
  "ip logger",
  "selfbot",
  "nuke bot",
  "no mercy nuke",
  "token stealer"
];

export class OAuthMaliciousAppDetectorInstance implements SecurityModule {
  readonly name = "oauthMaliciousAppDetector";

  init(): void {
    // Nothing to initialize
  }

  async scanGuildIntegrations(guild: Guild, alertCallback: (msg: string) => void): Promise<{ scanned: number; threatsFound: number }> {
    try {
      const integrations = await guild.fetchIntegrations();
      const integrationArray = Array.from(integrations.values());
      const results = await Promise.all(integrationArray.map(async (integration: any) => {
        const name = integration.name.toLowerCase();
        const isSuspicious = SUSPICIOUS_PATTERNS.some(pattern => name.includes(pattern));

        if (isSuspicious) {
          alertCallback(`🚨 [OAUTH MALICIOUS APP] Detected suspicious integration '${integration.name}' (ID: ${integration.id}) in **${guild.name}**! Executing instant deletion...`);
          await integration.delete("Zero Trust Anti-Nuke: Malicious OAuth2 App Detected").catch(() => {});
          return true;
        }
        return false;
      }));

      return {
        scanned: integrations.size,
        threatsFound: results.filter(Boolean).length
      };
    } catch (err) {
      console.error("[OAUTH MALICIOUS APP] Error scanning integrations:", err);
      return { scanned: 0, threatsFound: 0 };
    }
  }
}

/**
 * Global singleton instance (backwards compatibility).
 * @deprecated Use GuildContext.getOAuthMaliciousAppDetector() instead.
 */
export const OAuthMaliciousAppDetector = new OAuthMaliciousAppDetectorInstance();
