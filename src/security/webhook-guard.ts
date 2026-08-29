/**
 * WebhookGuard - Strict owner-only webhook policy enforcement.
 * Instance-based implementation for use with GuildContext.
 */

import type { SecurityModule } from "../core/interfaces/SecurityModule";
import type { Guild, Client } from "discord.js";

export class WebhookGuardInstance implements SecurityModule {
  readonly name = "webhookGuard";
  private whitelist = new Set<string>();

  init(): void {
    // Nothing to initialize
  }

  async verify(guild: Guild): Promise<void> {
    const webhooks = await guild.fetchWebhooks().catch(() => null);
    if (!webhooks) return;

    for (const [id, webhook] of webhooks) {
      const isBot = webhook.owner?.id === guild.client.user?.id;
      const isOwner = webhook.owner?.id === guild.ownerId;
      if (!this.whitelist.has(id) && !isBot && !isOwner) {
        await webhook.delete("Strict Owner-Only Webhook Policy: Non-Owner Webhook Removed").catch(() => {});
        console.log(`🛡️ [WEBHOOK GUARD] Deleted unauthorized non-owner webhook: ${webhook.name} in guild ${guild.name}`);
      }
    }
  }

  async scanAll(client: Client, alertCallback: (msg: string) => void): Promise<void> {
    let deletedCount = 0;
    for (const [_, guild] of client.guilds.cache) {
      try {
        const webhooks = await guild.fetchWebhooks();
        for (const [id, webhook] of webhooks) {
          const isBot = webhook.owner?.id === client.user?.id;
          const isOwner = webhook.owner?.id === guild.ownerId;
          if (!this.whitelist.has(id) && !isBot && !isOwner) {
            await webhook.delete("Strict Owner-Only Webhook Policy: Non-Owner Webhook Removed").catch(() => {});
            deletedCount++;
            alertCallback(`🛡️ [WEBHOOK GUARD] Neutralized non-owner webhook in **${guild.name}**: \`${webhook.name}\` (Owner-Only Enforcement)`);
          }
        }
      } catch (err) {
        console.error(`[WEBHOOK GUARD] Error scanning guild ${guild.name}:`, err);
      }
    }
  }

  addToWhitelist(id: string): void {
    this.whitelist.add(id);
  }

  removeFromWhitelist(id: string): void {
    this.whitelist.delete(id);
  }
}

/**
 * Global singleton instance (backwards compatibility).
 * @deprecated Use GuildContext.getWebhookGuard() instead.
 */
export const WebhookGuard = new WebhookGuardInstance();
