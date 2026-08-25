/**
 * BotEventHandlers - Discord event handlers.
 * Extracted from discord-bot.ts for modular architecture.
 */

import type { Client, Guild, Message, GuildMember, TextChannel, VoiceChannel, CategoryChannel, GuildChannel, Role, Integration, AuditLogEntry } from "discord.js";
import type { BotContext } from "../../core/contexts/BotContext";
import type { GuildContext } from "../../core/contexts/GuildContext";
import { GuildContext as GuildContextImpl } from "../../core/contexts/GuildContext";

// Guild context cache
const guildContexts = new Map<string, GuildContext>();

export function getGuildContext(guild: Guild, botContext: BotContext): GuildContext {
  let ctx = guildContexts.get(guild.id);
  if (!ctx) {
    ctx = new GuildContextImpl(guild, botContext);
    guildContexts.set(guild.id, ctx);
  }
  return ctx;
}

export class BotEventHandlers {
  constructor(
    private client: Client,
    private botContext: BotContext
  ) {}

  async onReady(): Promise<void> {
    console.log(`✅ Logged in as ${this.client.user?.tag}`);
    this.botContext.setClient(this.client);
  }

  async onGuildCreate(guild: Guild): Promise<void> {
    console.log(`Joined guild: ${guild.name}`);
    const ctx = getGuildContext(guild, this.botContext);
    await ctx.init();
  }

  async onGuildDelete(guild: Guild): Promise<void> {
    console.log(`Left guild: ${guild.name}`);
    const ctx = guildContexts.get(guild.id);
    if (ctx) {
      ctx.destroy();
      guildContexts.delete(guild.id);
    }
  }

  async onMessageCreate(message: Message): Promise<void> {
    if (message.author.bot || !message.guild) return;

    const ctx = getGuildContext(message.guild, this.botContext);
    const sentimentTracker = ctx.getSentimentTracker();

    await sentimentTracker.analyzeMessage(message, (msg: string) => {
      console.log(`[SENTIMENT] ${msg}`);
    });
  }

  async onInteractionCreate(interaction: any): Promise<void> {
    // Placeholder for slash command handling
    // Will be implemented with proper command modules
  }

  async onGuildMemberAdd(member: GuildMember): Promise<void> {
    if (!member.guild) return;

    const ctx = getGuildContext(member.guild, this.botContext);
    const joinShield = ctx.getJoinLimitShield();

    const isRaid = joinShield.recordJoin(member.guild.id);
    if (isRaid) {
      console.log(`[JOIN SHIELD] Raid detected in ${member.guild.name}`);
      // Could trigger lockdown here
    }
  }

  async onGuildMemberRemove(member: GuildMember): Promise<void> {
    // Placeholder for leave tracking
  }

  async onChannelCreate(channel: GuildChannel): Promise<void> {
    // Placeholder for channel creation monitoring
  }

  async onChannelDelete(channel: GuildChannel): Promise<void> {
    // Placeholder for channel deletion monitoring
  }

  async onRoleCreate(role: Role): Promise<void> {
    // Placeholder for role creation monitoring
  }

  async onRoleDelete(role: Role): Promise<void> {
    // Placeholder for role deletion monitoring
  }

  async onGuildUpdate(oldGuild: Guild, newGuild: Guild): Promise<void> {
    // Placeholder for guild update monitoring
  }

  async onWebhookUpdate(channel: GuildChannel): Promise<void> {
    if (!channel.guild) return;

    const ctx = getGuildContext(channel.guild, this.botContext);
    const webhookGuard = ctx.getWebhookGuard();

    await webhookGuard.verify(channel.guild);
  }

  async onIntegrationCreate(integration: Integration): Promise<void> {
    // Placeholder for integration creation monitoring
  }

  async onIntegrationDelete(integration: Integration): Promise<void> {
    // Placeholder for integration deletion monitoring
  }

  async onAuditLogEntryCreate(entry: AuditLogEntry): Promise<void> {
    if (!entry.guild) return;

    const ctx = getGuildContext(entry.guild, this.botContext);
    const auditMonitor = ctx.getAuditMonitor();

    auditMonitor.record({
      action: entry.actionType.toString(),
      executorId: entry.executorId,
      targetId: entry.targetId,
      guildId: entry.guildId,
      details: entry.changes
    });
  }
}
