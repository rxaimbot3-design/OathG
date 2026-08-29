import { Guild, Client } from "discord.js";
import { LruMap } from "../MapManager.js";
import { OwnerLock } from "./owner-lock.js";

export interface WebhookGuardConfig {
  whitelistSize?: number;
  alertCallback?: (msg: string) => void;
}

export class WebhookGuard {
  private static instance: WebhookGuard;
  private whitelist: LruMap<string, boolean>;
  private config: Required<WebhookGuardConfig>;

  private constructor(config: WebhookGuardConfig = {}) {
    this.config = {
      whitelistSize: config.whitelistSize ?? 5000,
      alertCallback: config.alertCallback ?? (() => {}),
    };
    this.whitelist = new LruMap<string, boolean>(this.config.whitelistSize);
  }

  static getInstance(config?: WebhookGuardConfig): WebhookGuard {
    if (!WebhookGuard.instance) {
      WebhookGuard.instance = new WebhookGuard(config);
    }
    return WebhookGuard.instance;
  }

  static resetInstance(): void {
    WebhookGuard.instance = undefined as any;
  }

  addToWhitelist(webhookId: string): void {
    this.whitelist.set(webhookId, true);
  }

  removeFromWhitelist(webhookId: string): void {
    this.whitelist.delete(webhookId);
  }

  isWhitelisted(webhookId: string): boolean {
    return this.whitelist.has(webhookId);
  }

  async verify(guild: Guild): Promise<number> {
    let deletedCount = 0;
    const webhooks = await guild.fetchWebhooks().catch(() => null);
    if (webhooks) {
      for (const [_, webhook] of webhooks) {
        const isBot = webhook.owner?.id === guild.client.user?.id;
        const isOwner = webhook.owner?.id === guild.ownerId || 
          (webhook.owner?.id && OwnerLock.isOwner(webhook.owner.id, guild.ownerId));
        
        if (!this.whitelist.has(webhook.id) && !isBot && !isOwner) {
          await webhook.delete("Strict Owner-Only Webhook Policy: Non-Owner Webhook Removed").catch(() => {});
          console.log(`🛡️ [WEBHOOK GUARD] Deleted unauthorized non-owner webhook: ${webhook.name} in guild ${guild.name}`);
          deletedCount++;
        }
      }
    }
    return deletedCount;
  }

  async scanAll(client: Client): Promise<number> {
    let deletedCount = 0;
    for (const [_, guild] of client.guilds.cache) {
      try {
        const webhooks = await guild.fetchWebhooks();
        for (const [id, webhook] of webhooks) {
          const isBot = webhook.owner?.id === client.user?.id;
          const isOwner = webhook.owner?.id === guild.ownerId || 
            (webhook.owner?.id && OwnerLock.isOwner(webhook.owner.id, guild.ownerId));
          
          if (!this.whitelist.has(id) && !isBot && !isOwner) {
            await webhook.delete("Strict Owner-Only Webhook Policy: Non-Owner Webhook Removed").catch(() => {});
            deletedCount++;
            this.config.alertCallback(
              `🛡️ [WEBHOOK GUARD] Neutralized non-owner webhook in **${guild.name}**: \`${webhook.name}\` (Owner-Only Enforcement)`
            );
          }
        }
      } catch (err: any) {
        console.error(`[WEBHOOK GUARD] Error scanning guild ${guild.name}:`, err);
      }
    }
    return deletedCount;
  }

  getWhitelistSize(): number {
    return this.whitelist.size;
  }

  clearWhitelist(): void {
    this.whitelist.clear();
  }
}