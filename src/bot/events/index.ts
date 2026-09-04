/**
 * Bot Event Handlers
 * Clean separation of Discord gateway event handling
 */

import type { BotClient } from "../client/index.js";
import {
  Events,
  type Guild,
  type Message,
  type GuildMember,
  type Interaction,
  type Channel,
  type VoiceState,
  type GuildBan,
  type GuildAuditLogsEntry,
} from "discord.js";
import { createModuleLogger } from "../../logging/logger.js";
import { getGuildContext, destroyGuildContext } from "../../core/contexts/GuildContext.js";
import { botContext } from "../../core/contexts/BotContext.js";

const logger = createModuleLogger("bot:events");

export function registerEventHandlers(client: BotClient): void {
  // ============================================================
  // Client Ready
  // ============================================================
  client.once(Events.ClientReady, async (readyClient) => {
    logger.info(
      { username: readyClient.user.tag, guildCount: readyClient.guilds.cache.size },
      "Bot connected and ready"
    );

    // Validate permissions for all guilds
    await validateBotPermissions(readyClient);
    
    // Initialize invite tracking for all guilds
    await initializeInviteCache(readyClient);
    
    // Register slash commands
    await registerSlashCommands(readyClient);
    
    // Start background tasks
    startBackgroundTasks(readyClient);
  });

  // ============================================================
  // Guild Join/Leave
  // ============================================================
  client.on(Events.GuildCreate, async (guild: Guild) => {
    logger.info({ guildId: guild.id, guildName: guild.name }, "Joined new guild");
    
    const ctx = getGuildContext(guild, botContext);
    await ctx.init();
    
    // Clean up guild command duplicates
    try {
      await guild.commands.set([]);
      logger.info({ guildId: guild.id }, "Cleared guild command duplicates");
    } catch (error) {
      logger.warn({ guildId: guild.id, error }, "Failed to clear guild commands");
    }
    
    // Initialize invite cache
    try {
      const invites = await guild.invites.fetch();
      ctx.inviteTracker.syncGuildInvites(guild.id, invites);
    } catch (error) {
      logger.warn({ guildId: guild.id, error }, "Failed to initialize invite cache");
    }
  });

  client.on(Events.GuildDelete, async (guild: Guild) => {
    logger.info({ guildId: guild.id, guildName: guild.name }, "Left guild");
    
    // Clean up invite tracking
    try {
      ctx.inviteTracker.resetGuildSync(guild.id);
    } catch {}
    
    // Destroy guild context to prevent memory leaks
    destroyGuildContext(guild.id);
  });

  // ============================================================
  // Message Handling
  // ============================================================
  client.on(Events.MessageCreate, async (message: Message) => {
    if (!message.guild || message.author.bot) return;
    
    const ctx = getGuildContext(message.guild, botContext);
    
    // Sentiment analysis
    if (message.content.length > 0) {
      try {
        await ctx.sentimentTracker.analyzeMessage(message, (msg) => 
          logger.warn({ guildId: message.guild!.id, userId: message.author.id }, msg)
        );
      } catch (error) {
        logger.error({ guildId: message.guild.id, error }, "Sentiment analysis failed");
      }
    }
    
    // AI Deep Scan for longer messages
    if (message.content.length > 10) {
      try {
        const { AIDeepScan } = await import("../../security/modules/ai-deep-scan.js");
        const threatScore = await AIDeepScan.getInstance().analyzeMessage(
          message.content,
          message.author.id,
          message.channel.id
        );
        
        if (threatScore > 80 && message.member) {
          await ctx.quarantine.isolate(message.member);
          await message.delete().catch(() => {});
          logger.warn(
            { guildId: message.guild.id, userId: message.author.id, threatScore },
            "AI Deep Scan blocked message"
          );
        }
      } catch (error) {
        logger.error({ guildId: message.guild.id, error }, "AI Deep Scan failed");
      }
    }
  });

  // ============================================================
  // Member Join/Leave
  // ============================================================
  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    const ctx = getGuildContext(member.guild, botContext);
    
    // Join limit shield
    try {
      const result = await ctx.joinLimitShield.onMemberJoin(member);
      if (result === "quarantine") {
        await ctx.quarantine.isolate(member);
        logger.warn({ guildId: member.guild.id, userId: member.id }, "Member quarantined by join limit shield");
      }
    } catch (error) {
      logger.error({ guildId: member.guild.id, error }, "Join limit shield failed");
    }
    
    // Invite tracking
    try {
      await ctx.inviteTracker.onMemberJoin(member);
    } catch (error) {
      logger.error({ guildId: member.guild.id, error }, "Invite tracking failed");
    }
    
    // Behavior scoring for new members
    try {
      const risk = ctx.behaviorScoring.getRisk(member.id);
      if (risk.score > 50) {
        await ctx.quarantine.isolate(member);
        logger.warn({ guildId: member.guild.id, userId: member.id, score: risk.score }, "High-risk member quarantined on join");
      }
    } catch (error) {
      logger.error({ guildId: member.guild.id, error }, "Behavior scoring failed");
    }
  });

  client.on(Events.GuildMemberRemove, async (member: GuildMember) => {
    const ctx = getGuildContext(member.guild, botContext);
    
    try {
      await ctx.inviteTracker.onMemberLeave(member);
    } catch (error) {
      logger.error({ guildId: member.guild.id, error }, "Invite leave tracking failed");
    }
  });

  // ============================================================
  // Audit Log Events (Anti-Nuke)
  // ============================================================
  client.on(Events.GuildAuditLogEntryCreate, async (entry: GuildAuditLogsEntry) => {
    if (!entry.guild) return;
    
    const ctx = getGuildContext(entry.guild, botContext);
    
    try {
      await ctx.auditMonitor.processAuditLogEntry(entry);
    } catch (error) {
      logger.error({ guildId: entry.guild.id, error }, "Audit log processing failed");
    }
  });

  // ============================================================
  // Channel Events
  // ============================================================
  client.on(Events.ChannelCreate, async (channel: Channel) => {
    if (!channel.guild) return;
    const ctx = getGuildContext(channel.guild, botContext);
    
    // Snapshot for recovery
    try {
      await ctx.serverSnapshotRestore.createSnapshot(channel.guild);
    } catch {}
  });

  client.on(Events.ChannelDelete, async (channel: Channel) => {
    if (!channel.guild) return;
    const ctx = getGuildContext(channel.guild, botContext);
    
    // Auto-heal deleted channels
    try {
      await ctx.autoHeal.onChannelDelete(channel);
    } catch (error) {
      logger.error({ guildId: channel.guild.id, error }, "Auto-heal channel delete failed");
    }
  });

  client.on(Events.ChannelUpdate, async (oldChannel: Channel, newChannel: Channel) => {
    if (!newChannel.guild) return;
    const ctx = getGuildContext(newChannel.guild, botContext);
    
    try {
      await ctx.autoHeal.onChannelUpdate(oldChannel, newChannel);
    } catch (error) {
      logger.error({ guildId: newChannel.guild.id, error }, "Auto-heal channel update failed");
    }
  });

  // ============================================================
  // Role Events
  // ============================================================
  client.on(Events.RoleCreate, async (role) => {
    const ctx = getGuildContext(role.guild, botContext);
    try {
      await ctx.autoHeal.onRoleCreate(role);
    } catch (error) {
      logger.error({ guildId: role.guild.id, error }, "Auto-heal role create failed");
    }
  });

  client.on(Events.RoleDelete, async (role) => {
    const ctx = getGuildContext(role.guild, botContext);
    try {
      await ctx.autoHeal.onRoleDelete(role);
    } catch (error) {
      logger.error({ guildId: role.guild.id, error }, "Auto-heal role delete failed");
    }
  });

  client.on(Events.RoleUpdate, async (oldRole, newRole) => {
    const ctx = getGuildContext(newRole.guild, botContext);
    try {
      await ctx.autoHeal.onRoleUpdate(oldRole, newRole);
    } catch (error) {
      logger.error({ guildId: newRole.guild.id, error }, "Auto-heal role update failed");
    }
  });

  // ============================================================
  // Ban Events
  // ============================================================
  client.on(Events.GuildBanAdd, async (ban: GuildBan) => {
    const ctx = getGuildContext(ban.guild, botContext);
    try {
      await ctx.autoPermissionRollback.onBanAdd(ban);
    } catch (error) {
      logger.error({ guildId: ban.guild.id, error }, "Auto-permission rollback on ban failed");
    }
  });

  client.on(Events.GuildBanRemove, async (ban: GuildBan) => {
    const ctx = getGuildContext(ban.guild, botContext);
    try {
      await ctx.autoPermissionRollback.onBanRemove(ban);
    } catch (error) {
      logger.error({ guildId: ban.guild.id, error }, "Auto-permission rollback on unban failed");
    }
  });

  // ============================================================
  // Interaction Handling (Slash Commands, Buttons, Modals)
  // ============================================================
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.guild) return;
    
    const ctx = getGuildContext(interaction.guild, botContext);
    
    try {
      if (interaction.isChatInputCommand()) {
        await handleSlashCommand(interaction, ctx);
      } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction, ctx);
      } else if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction, ctx);
      } else if (interaction.isAutocomplete()) {
        await handleAutocomplete(interaction, ctx);
      }
    } catch (error) {
      logger.error({ guildId: interaction.guild.id, error }, "Interaction handling failed");
      
      if (interaction.isRepliable()) {
        await interaction.reply({
          content: "❌ An error occurred while processing this interaction.",
          ephemeral: true,
        }).catch(() => {});
      }
    }
  });

  // ============================================================
  // Voice State Updates
  // ============================================================
  client.on(Events.VoiceStateUpdate, async (oldState: VoiceState, newState: VoiceState) => {
    const guild = newState.guild ?? oldState.guild;
    if (!guild) return;
    
    const ctx = getGuildContext(guild, botContext);
    
    try {
      // Locked VC enforcement
      if (newState.channelId && !oldState.channelId) {
        // Member joined a VC - check if it's locked
        await ctx.nukeDefense.lockdown(guild); // This would need a proper check
      }
    } catch (error) {
      logger.error({ guildId: guild.id, error }, "Voice state update handling failed");
    }
  });

  // ============================================================
  // Error Handling
  // ============================================================
  client.on(Events.Error, (error) => {
    logger.error({ error }, "Discord client error");
  });

  client.on(Events.Warn, (warning) => {
    logger.warn({ warning }, "Discord client warning");
  });

  client.on(Events.Debug, (info) => {
    if (process.env.LOG_LEVEL === "debug") {
      logger.debug({ info }, "Discord debug");
    }
  });
}

// ============================================================
// Helper Functions
// ============================================================

async function validateBotPermissions(client: BotClient): Promise<void> {
  // Import dynamically to avoid circular deps
  const { validateBotPermissions: validate } = await import("../client/index.js");
  await validate(client);
}

async function initializeInviteCache(client: BotClient): Promise<void> {
  for (const [guildId, guild] of client.guilds.cache) {
    try {
      const invites = await guild.invites.fetch();
      const ctx = getGuildContext(guild, botContext);
      ctx.inviteTracker.syncGuildInvites(guildId, invites);
    } catch (error) {
      logger.warn({ guildId, error }, "Failed to initialize invite cache");
    }
  }
}

async function registerSlashCommands(client: BotClient): Promise<void> {
  // Import command definitions
  const { commands } = await import("../commands/index.js");
  
  try {
    // Global registration
    await client.application?.commands.set(commands);
    logger.info({ count: commands.length }, "Global slash commands registered");
    
    // Clear guild duplicates
    for (const [guildId, guild] of client.guilds.cache) {
      try {
        await guild.commands.set([]);
      } catch (error) {
        logger.warn({ guildId, error }, "Failed to clear guild commands");
      }
    }
  } catch (error) {
    logger.error({ error }, "Failed to register slash commands");
  }
}

function startBackgroundTasks(client: BotClient): void {
  // Active sweep - every 10 minutes
  setInterval(async () => {
    for (const [guildId, guild] of client.guilds.cache) {
      try {
        await runActiveSweep(guild);
      } catch (error) {
        logger.error({ guildId, error }, "Active sweep failed");
      }
    }
  }, 10 * 60 * 1000);
  
  // Daily backup - every 24 hours
  setInterval(async () => {
    for (const [guildId, guild] of client.guilds.cache) {
      try {
        const ctx = getGuildContext(guild, botContext);
        await ctx.serverSnapshotRestore.createSnapshot(guild);
      } catch (error) {
        logger.error({ guildId, error }, "Daily backup failed");
      }
    }
  }, 24 * 60 * 60 * 1000);
  
  // Cleanup intervals
  setInterval(() => {
    // Cleanup handled by TtlMap auto-cleanup
  }, 5 * 60 * 1000);
}

async function runActiveSweep(guild: Guild): Promise<void> {
  const ctx = getGuildContext(guild, botContext);
  
  // 1. Scan for malicious OAuth apps
  try {
    await ctx.oAuthMaliciousAppDetector.scanGuildIntegrations(guild);
  } catch (error) {
    logger.error({ guildId: guild.id, error }, "OAuth scan failed");
  }
  
  // 2. Scan for unauthorized bots
  try {
    for (const [memberId, member] of guild.members.cache) {
      if (member.user.bot && member.id !== guild.client.user?.id) {
        const isApproved = ctx.inviteTracker.isBotApproved(member.id);
        if (!isApproved) {
          await member.kick("Zero Trust: Unapproved bot detected").catch(() => {});
          logger.warn({ guildId: guild.id, botId: member.id }, "Kicked unapproved bot");
        }
      }
    }
  } catch (error) {
    logger.error({ guildId: guild.id, error }, "Unauthorized bot scan failed");
  }
  
  // 3. Scan webhooks
  try {
    await ctx.webhookGuard.scanAll(guild.client);
  } catch (error) {
    logger.error({ guildId: guild.id, error }, "Webhook scan failed");
  }
}

// ============================================================
// Interaction Handlers (Stubs - implement in commands module)
// ============================================================

async function handleSlashCommand(interaction: any, ctx: any): Promise<void> {
  const { handleSlashCommand } = await import("../commands/index.js");
  await handleSlashCommand(interaction, ctx);
}

async function handleButtonInteraction(interaction: any, ctx: any): Promise<void> {
  const { handleButtonInteraction } = await import("../commands/index.js");
  await handleButtonInteraction(interaction, ctx);
}

async function handleModalSubmit(interaction: any, ctx: any): Promise<void> {
  const { handleModalSubmit } = await import("../commands/index.js");
  await handleModalSubmit(interaction, ctx);
}

async function handleAutocomplete(interaction: any, ctx: any): Promise<void> {
  const { handleAutocomplete } = await import("../commands/index.js");
  await handleAutocomplete(interaction, ctx);
}