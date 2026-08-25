/**
 * DiscordClient - Discord bot client initialization and management.
 * Extracted from discord-bot.ts for modular architecture.
 */

import { Client, GatewayIntentBits, Partials } from "discord.js";
import { botContext } from "../core/contexts/BotContext";
import { BotEventHandlers } from "./events";

export class DiscordClient {
  private client: Client;
  private eventHandlers: BotEventHandlers;
  private _ready = false;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildMessageReactions,
      ],
      partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    });

    this.eventHandlers = new BotEventHandlers(this.client, botContext);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on("ready", () => this.eventHandlers.onReady());
    this.client.on("guildCreate", (guild) => this.eventHandlers.onGuildCreate(guild));
    this.client.on("guildDelete", (guild) => this.eventHandlers.onGuildDelete(guild));
    this.client.on("messageCreate", (message) => this.eventHandlers.onMessageCreate(message));
    this.client.on("interactionCreate", (interaction) => this.eventHandlers.onInteractionCreate(interaction));
    this.client.on("guildMemberAdd", (member) => this.eventHandlers.onGuildMemberAdd(member));
    this.client.on("guildMemberRemove", (member) => this.eventHandlers.onGuildMemberRemove(member));
    this.client.on("channelCreate", (channel) => this.eventHandlers.onChannelCreate(channel));
    this.client.on("channelDelete", (channel) => this.eventHandlers.onChannelDelete(channel));
    this.client.on("roleCreate", (role) => this.eventHandlers.onRoleCreate(role));
    this.client.on("roleDelete", (role) => this.eventHandlers.onRoleDelete(role));
    this.client.on("guildUpdate", (oldGuild, newGuild) => this.eventHandlers.onGuildUpdate(oldGuild, newGuild));
    this.client.on("webhookUpdate", (channel) => this.eventHandlers.onWebhookUpdate(channel));
    this.client.on("integrationCreate", (integration) => this.eventHandlers.onIntegrationCreate(integration));
    this.client.on("integrationDelete", (integration) => this.eventHandlers.onIntegrationDelete(integration));
    this.client.on("auditLogEntryCreate", (entry) => this.eventHandlers.onAuditLogEntryCreate(entry));
  }

  getClient(): Client {
    return this.client;
  }

  get isReady(): boolean {
    return this.client.isReady();
  }

  get readyAt(): Date | null {
    return this.client.readyAt;
  }

  async start(token: string): Promise<void> {
    await this.client.login(token);
  }

  async stop(): Promise<void> {
    this.client.destroy();
    this._ready = false;
  }
}
