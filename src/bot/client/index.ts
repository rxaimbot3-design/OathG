/**
 * Discord Bot Client Setup
 * Clean separation of client creation and configuration
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
  type ClientOptions,
} from "discord.js";
import { config } from "../../config/index.js";
import { createModuleLogger } from "../../logging/logger.js";

const logger = createModuleLogger("bot:client");

export interface BotClient extends Client {
  // Extended properties for our bot
  startTime: number;
}

export function createBotClient(): BotClient {
  const clientOptions: ClientOptions = {
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildEmojisAndStickers,
      GatewayIntentBits.GuildIntegrations,
      GatewayIntentBits.GuildWebhooks,
      GatewayIntentBits.GuildInvites,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.DirectMessageReactions,
    ],
    partials: [
      Partials.Channel,
      Partials.Message,
      Partials.User,
      Partials.GuildMember,
      Partials.Reaction,
    ],
    rest: {
      timeout: 15000,
      retries: 3,
      globalRequestsPerSecond: 50,
    },
    sweepers: {
      messages: {
        interval: 300,
        lifetime: 1800,
      },
    },
    makeCache: {
      // Optimize cache for large bots
      GuildMemberManager: {
        maxSize: 1000,
        keepOver: 1000,
      },
    },
  };

  const client = new Client(clientOptions) as BotClient;
  client.startTime = Date.now();

  logger.info({ guildCount: 0 }, "Bot client created");
  return client;
}

export function setupPresenceRotator(client: BotClient): NodeJS.Timeout {
  let statusIndex = 0;
  
  const activities = [
    { name: `🛡️ Zero Trust Anti-Nuke`, type: ActivityType.Playing },
    { name: `👥 Guarding servers`, type: ActivityType.Watching },
    { name: `🧠 ASHTRON Enterprise AI`, type: ActivityType.Listening },
    { name: `⚡ Sub-17ms threat detection`, type: ActivityType.Competing },
  ];

  const interval = setInterval(() => {
    if (!client.user || !client.isReady()) return;
    
    const guildCount = client.guilds.cache.size;
    const memberCount = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);
    
    const current = activities[statusIndex % activities.length];
    client.user.setPresence({
      activities: [
        { 
          name: current.name.replace("servers", `${guildCount} servers`).replace("ASHTRON", `ASHTRON • ${memberCount} members`),
          type: current.type 
        },
      ],
      status: "online",
    });
    statusIndex++;
  }, 30000);

  return interval;
}

export async function validateBotPermissions(client: BotClient): Promise<void> {
  for (const [guildId, guild] of client.guilds.cache) {
    try {
      const fullGuild = await guild.fetch();
      const me = fullGuild.members.me;
      
      if (!me) {
        logger.warn({ guildId, guildName: fullGuild.name }, "Bot not in guild member cache");
        continue;
      }

      const hasAuditLog = me.permissions.has("ViewAuditLog") || me.permissions.has("Administrator");
      const hasBanMembers = me.permissions.has("BanMembers") || me.permissions.has("Administrator");
      const hasManageRoles = me.permissions.has("ManageRoles") || me.permissions.has("Administrator");
      const hasManageChannels = me.permissions.has("ManageChannels") || me.permissions.has("Administrator");

      if (!hasAuditLog) {
        logger.warn(
          { guildId, guildName: fullGuild.name },
          "Missing 'View Audit Log' permission - anti-nuke protection degraded"
        );
      }
      if (!hasBanMembers) {
        logger.warn(
          { guildId, guildName: fullGuild.name },
          "Missing 'Ban Members' permission - rogue admin banning disabled"
        );
      }
      if (!hasManageRoles) {
        logger.warn(
          { guildId, guildName: fullGuild.name },
          "Missing 'Manage Roles' permission - role-based protections degraded"
        );
      }
      if (!hasManageChannels) {
        logger.warn(
          { guildId, guildName: fullGuild.name },
          "Missing 'Manage Channels' permission - channel protections degraded"
        );
      }

      // Check role hierarchy
      const topAdminRole = fullGuild.roles.cache
        .filter(r => r.id !== me.roles.highest.id && (
          r.permissions.has("Administrator") ||
          r.permissions.has("KickMembers") ||
          r.permissions.has("BanMembers") ||
          r.permissions.has("ManageGuild")
        ))
        .sort((a, b) => b.position - a.position)
        .first();

      if (topAdminRole && me.roles.highest.position <= topAdminRole.position) {
        logger.warn(
          { 
            guildId, 
            guildName: fullGuild.name,
            botRole: me.roles.highest.name,
            botPosition: me.roles.highest.position,
            adminRole: topAdminRole.name,
            adminPosition: topAdminRole.position,
          },
          "Bot role is BELOW admin role - cannot moderate admins! Move bot role to TOP."
        );
      } else {
        logger.info(
          { guildId, guildName: fullGuild.name },
          "Role hierarchy verified - bot can enforce Zero Trust"
        );
      }
    } catch (error) {
      logger.error({ guildId, error }, "Failed to validate permissions for guild");
    }
  }
}