import { Client, GatewayIntentBits, Partials } from "discord.js";
import { MultiShardCluster } from "./MultiShardCluster.js";
import { ultraLowLatencyPipeline, PipelineEvent } from "./UltraLowLatencyPipeline.js";
import { log, createModuleLogger } from "../logging/logger.js";
import { CppNativeEngine } from "../CppEngine.js";
import {
  ZeroTrustSecurityEngine,
  NukeDefense,
  AiRaidPredictionEngine,
  BehaviorScoring,
  Quarantine,
  AutoHeal,
  TokenVault,
  IPBanSystem,
  RateLimiter,
  SessionHijackDetector,
  OAuthMaliciousAppDetector,
  BotTokenRotationSystem,
  AutoPermissionRollback,
  ServerSnapshotRestore,
  AntiVanityHijack,
  EmojiStickerProtection,
  ForumChannelProtection,
  JoinLimitShield,
  AntiInviteShield,
  InviteTrackerEngine,
  CanaryToken,
  DailyBackup,
  AuditLogMonitor,
  SentimentTracker,
  TemporalRaidLock,
  HoneypotAdminRole,
  WebhookGuard,
  AIDeepScan,
  GlobalIntelligence,
  OwnerLock,
  DMFirewall,
  SlashOnly,
  AntiPhishing,
  PremiumLicenseSystem,
  EnvScanner
} from "../SecurityFeatures.js";

const logger = createModuleLogger("ShardWorker");

(global as any).__workerStartTime = Date.now();
(global as any).__guildCount = 0;
(global as any).__memberCount = 0;

// Security engine instances (initialized per worker)
let zeroTrustEngine: ZeroTrustSecurityEngine;
let nukeDefense: NukeDefense;
let aiRaidPrediction: AiRaidPredictionEngine;
let behaviorScoring: BehaviorScoring;
let quarantine: Quarantine;
let autoHeal: AutoHeal;
let tokenVault: TokenVault;
let ipBanSystem: IPBanSystem;
let rateLimiter: RateLimiter;
let sessionHijackDetector: SessionHijackDetector;
let oauthDetector: OAuthMaliciousAppDetector;
let botTokenRotation: BotTokenRotationSystem;
let autoPermRollback: AutoPermissionRollback;
let serverSnapshot: ServerSnapshotRestore;
let antiVanityHijack: AntiVanityHijack;
let emojiStickerProtection: EmojiStickerProtection;
let forumProtection: ForumChannelProtection;
let joinLimitShield: JoinLimitShield;
let antiInviteShield: AntiInviteShield;
let inviteTracker: InviteTrackerEngine;
let canaryToken: CanaryToken;
let dailyBackup: DailyBackup;
let auditLogMonitor: AuditLogMonitor;
let sentimentTracker: SentimentTracker;
let temporalRaidLock: TemporalRaidLock;
let honeypotAdminRole: HoneypotAdminRole;
let webhookGuard: WebhookGuard;
let aiDeepScan: AIDeepScan;
let globalIntelligence: GlobalIntelligence;
let ownerLock: OwnerLock;
let dmFirewall: DMFirewall;
let slashOnly: SlashOnly;
let antiPhishing: AntiPhishing;
let premiumLicense: PremiumLicenseSystem;
let envScanner: EnvScanner;

async function initializeSecurityEngines() {
  logger.info({ module: "ShardWorker" }, "Initializing security engines...");
  
  zeroTrustEngine = new ZeroTrustSecurityEngine();
  nukeDefense = new NukeDefense();
  aiRaidPrediction = new AiRaidPredictionEngine();
  behaviorScoring = new BehaviorScoring();
  quarantine = new Quarantine();
  autoHeal = new AutoHeal();
  tokenVault = new TokenVault();
  ipBanSystem = new IPBanSystem();
  rateLimiter = new RateLimiter();
  sessionHijackDetector = new SessionHijackDetector();
  oauthDetector = new OAuthMaliciousAppDetector();
  botTokenRotation = new BotTokenRotationSystem();
  autoPermRollback = new AutoPermissionRollback();
  serverSnapshot = new ServerSnapshotRestore();
  antiVanityHijack = new AntiVanityHijack();
  emojiStickerProtection = new EmojiStickerProtection();
  forumProtection = new ForumChannelProtection();
  joinLimitShield = new JoinLimitShield();
  antiInviteShield = new AntiInviteShield();
  inviteTracker = new InviteTrackerEngine();
  canaryToken = new CanaryToken();
  dailyBackup = new DailyBackup();
  auditLogMonitor = new AuditLogMonitor();
  sentimentTracker = new SentimentTracker();
  temporalRaidLock = new TemporalRaidLock();
  honeypotAdminRole = new HoneypotAdminRole();
  webhookGuard = new WebhookGuard();
  aiDeepScan = new AIDeepScan();
  globalIntelligence = new GlobalIntelligence();
  ownerLock = new OwnerLock();
  dmFirewall = new DMFirewall();
  slashOnly = new SlashOnly();
  antiPhishing = new AntiPhishing();
  premiumLicense = new PremiumLicenseSystem();
  envScanner = new EnvScanner();
  
  logger.info({ module: "ShardWorker" }, "✅ All security engines initialized");
}

async function createShardedClient(shardIds: number[], totalShards: number): Promise<Client> {
  const client = new Client({
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
      GatewayIntentBits.DirectMessageReactions
    ],
    partials: [
      Partials.Channel,
      Partials.Message,
      Partials.User,
      Partials.GuildMember,
      Partials.Reaction
    ],
    shards: shardIds,
    shardCount: totalShards,
    rest: {
      timeout: 15000,
      retries: 3,
      globalRequestsPerSecond: 50
    },
    sweepers: {
      messages: {
        interval: 300,
        lifetime: 1800
      }
    },
    makeCache: {
      MessageManager: 500,
      GuildMemberManager: 1000,
      ReactionManager: 500,
      VoiceStateManager: 200
    },
    ws: {
      properties: {
        $browser: "Discord iOS",
        $device: "iOS",
        $os: "iOS"
      },
      compress: true,
      largeThreshold: 250
    }
  });

  client.on("shardReady", (shardId: number, unavailableGuilds: Set<string>) => {
    logger.info({ module: "ShardWorker" }, `Shard ${shardId} ready`, { unavailableGuilds: unavailableGuilds.size });
  });

  client.on("shardDisconnect", (event: any, shardId: number) => {
    logger.warn({ module: "ShardWorker" }, `Shard ${shardId} disconnected`, { code: event.code });
  });

  client.on("shardReconnecting", (shardId: number) => {
    logger.info({ module: "ShardWorker" }, `Shard ${shardId} reconnecting...`);
  });

  client.on("shardResume", (shardId: number, replayedEvents: number) => {
    logger.info({ module: "ShardWorker" }, `Shard ${shardId} resumed`, { replayedEvents });
  });

  client.on("invalidated", () => {
    logger.error({ module: "ShardWorker" }, "Session invalidated - cannot resume");
    process.exit(1);
  });

  return client;
}

function setupEventHandlers(client: Client) {
  // Raw packet processing for ultra-low latency pipeline
  client.on("raw", (packet: any) => {
    if (!packet?.t) return;

    const event: PipelineEvent = {
      type: packet.t,
      guildId: packet.d?.guild_id || "dm",
      payload: packet.d,
      priority: getEventPriority(packet.t)
    };

    ultraLowLatencyPipeline.enqueue(event).catch((err) => {
      logger.error({ module: "ShardWorker" }, "Pipeline enqueue failed", { error: err.message });
    });
  });

  // Guild member add - Anti-raid, join limiting, behavior scoring
  client.on("guildMemberAdd", async (member) => {
    try {
      const guildId = member.guild.id;
      const userId = member.id;
      
      // Join limit shield
      await joinLimitShield.checkJoin(guildId, userId);
      
      // Behavior scoring for new member
      await behaviorScoring.scoreUser(userId, guildId, {
        action: "join",
        accountAge: Date.now() - member.user.createdTimestamp,
        hasAvatar: !!member.user.avatar,
        isBot: member.user.bot
      });
      
      // Anti-raid prediction
      await aiRaidPrediction.analyzeJoin(guildId, userId);
      
      // Invite tracking
      await inviteTracker.trackJoin(guildId, userId);
      
      // Quarantine check
      if (await quarantine.isQuarantined(userId, guildId)) {
        await member.kick("User is quarantined").catch(() => {});
        return;
      }
      
      // Update counts
      (global as any).__guildCount = client.guilds.cache.size;
      (global as any).__memberCount = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "guildMemberAdd handler error", { error: err });
    }
  });

  // Guild member remove - Nuke defense, auto-heal
  client.on("guildMemberRemove", async (member) => {
    try {
      const guildId = member.guild.id;
      const userId = member.id;
      
      // Nuke defense - detect mass kicks/bans
      await nukeDefense.recordAction(guildId, userId, "kick");
      
      // Auto-heal - restore if needed
      await autoHeal.recordRemoval(guildId, userId, "member");
      
      // Update counts
      (global as any).__guildCount = client.guilds.cache.size;
      (global as any).__memberCount = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "guildMemberRemove handler error", { error: err });
    }
  });

  // Channel create/update/delete - Nuke defense, anti-vanity, forum protection
  client.on("channelCreate", async (channel) => {
    try {
      if (!channel.guild) return;
      await nukeDefense.recordAction(channel.guild.id, channel.id, "channelCreate");
      await antiVanityHijack.checkChannelCreate(channel);
      await forumProtection.checkChannelCreate(channel);
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "channelCreate handler error", { error: err });
    }
  });

  client.on("channelDelete", async (channel) => {
    try {
      if (!channel.guild) return;
      await nukeDefense.recordAction(channel.guild.id, channel.id, "channelDelete");
      await autoHeal.recordRemoval(channel.guild.id, channel.id, "channel");
      await serverSnapshot.recordChange(channel.guild.id, "channelDelete", channel);
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "channelDelete handler error", { error: err });
    }
  });

  client.on("channelUpdate", async (oldChannel, newChannel) => {
    try {
      if (!newChannel.guild) return;
      await antiVanityHijack.checkChannelUpdate(oldChannel, newChannel);
      await forumProtection.checkChannelUpdate(oldChannel, newChannel);
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "channelUpdate handler error", { error: err });
    }
  });

  // Role create/update/delete - Nuke defense, auto-permission rollback
  client.on("roleCreate", async (role) => {
    try {
      await nukeDefense.recordAction(role.guild.id, role.id, "roleCreate");
      await autoPermRollback.recordRoleCreate(role);
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "roleCreate handler error", { error: err });
    }
  });

  client.on("roleDelete", async (role) => {
    try {
      await nukeDefense.recordAction(role.guild.id, role.id, "roleDelete");
      await autoHeal.recordRemoval(role.guild.id, role.id, "role");
      await serverSnapshot.recordChange(role.guild.id, "roleDelete", role);
      await autoPermRollback.recordRoleDelete(role);
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "roleDelete handler error", { error: err });
    }
  });

  client.on("roleUpdate", async (oldRole, newRole) => {
    try {
      await autoPermRollback.checkPermissionChange(oldRole, newRole);
      await nukeDefense.recordAction(newRole.guild.id, newRole.id, "roleUpdate");
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "roleUpdate handler error", { error: err });
    }
  });

  // Ban add/remove - Nuke defense, IP ban, auto-heal
  client.on("guildBanAdd", async (ban) => {
    try {
      await nukeDefense.recordAction(ban.guild.id, ban.user.id, "ban");
      await ipBanSystem.banIP(ban.guild.id, ban.user.id, "Ban via Discord API");
      await autoHeal.recordRemoval(ban.guild.id, ban.user.id, "ban");
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "guildBanAdd handler error", { error: err });
    }
  });

  client.on("guildBanRemove", async (ban) => {
    try {
      await autoHeal.recordRemoval(ban.guild.id, ban.user.id, "banRemove");
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "guildBanRemove handler error", { error: err });
    }
  });

  // Webhook create/update/delete - Webhook guard
  client.on("webhooksUpdate", async (channel) => {
    try {
      if (!channel.guild) return;
      await webhookGuard.checkWebhooks(channel.guild.id);
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "webhooksUpdate handler error", { error: err });
    }
  });

  // Emoji/Sticker create/delete - EmojiStickerProtection
  client.on("guildEmojiCreate", async (emoji) => {
    try {
      await emojiStickerProtection.checkEmojiCreate(emoji);
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "guildEmojiCreate handler error", { error: err });
    }
  });

  client.on("guildEmojiDelete", async (emoji) => {
    try {
      await emojiStickerProtection.checkEmojiDelete(emoji);
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "guildEmojiDelete handler error", { error: err });
    }
  });

  client.on("guildStickerCreate", async (sticker) => {
    try {
      await emojiStickerProtection.checkStickerCreate(sticker);
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "guildStickerCreate handler error", { error: err });
    }
  });

  client.on("guildStickerDelete", async (sticker) => {
    try {
      await emojiStickerProtection.checkStickerDelete(sticker);
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "guildStickerDelete handler error", { error: err });
    }
  });

  // Message create - Anti-phishing, sentiment, slash-only, DM firewall
  client.on("messageCreate", async (message) => {
    try {
      if (message.author.bot) return;
      
      // Slash-only mode
      await slashOnly.checkMessage(message);
      
      // Anti-phishing
      await antiPhishing.scanMessage(message);
      
      // Sentiment tracking
      await sentimentTracker.analyzeMessage(message);
      
      // DM firewall
      if (message.channel.type === 1) { // DMChannel
        await dmFirewall.checkDM(message);
      }
      
      // AI deep scan for suspicious content
      await aiDeepScan.scanMessage(message);
      
      // Behavior scoring
      await behaviorScoring.scoreUser(message.author.id, message.guildId || "dm", {
        action: "message",
        content: message.content,
        attachments: message.attachments.size
      });
      
      // Update counts
      (global as any).__guildCount = client.guilds.cache.size;
      (global as any).__memberCount = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "messageCreate handler error", { error: err });
    }
  });

  // Message delete/update - Auto-heal, audit log
  client.on("messageDelete", async (message) => {
    try {
      if (message.guild) {
        await autoHeal.recordRemoval(message.guild.id, message.id, "message");
      }
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "messageDelete handler error", { error: err });
    }
  });

  // Presence update - Session hijack detection
  client.on("presenceUpdate", async (oldPresence, newPresence) => {
    try {
      if (newPresence?.userId) {
        await sessionHijackDetector.checkPresence(newPresence.userId, newPresence);
      }
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "presenceUpdate handler error", { error: err });
    }
  });

  // Voice state update - Voice processing
  client.on("voiceStateUpdate", async (oldState, newState) => {
    try {
      // Voice processing would go here
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "voiceStateUpdate handler error", { error: err });
    }
  });

  // Guild create/delete - Global intelligence, daily backup
  client.on("guildCreate", async (guild) => {
    try {
      await globalIntelligence.registerGuild(guild);
      await dailyBackup.scheduleGuildBackup(guild.id);
      await serverSnapshot.createSnapshot(guild);
      
      (global as any).__guildCount = client.guilds.cache.size;
      (global as any).__memberCount = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "guildCreate handler error", { error: err });
    }
  });

  client.on("guildDelete", async (guild) => {
    try {
      await globalIntelligence.unregisterGuild(guild.id);
      
      (global as any).__guildCount = client.guilds.cache.size;
      (global as any).__memberCount = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "guildDelete handler error", { error: err });
    }
  });

  // Audit log entries - Audit log monitor, owner lock
  client.on("guildAuditLogEntryCreate", async (entry) => {
    try {
      await auditLogMonitor.processEntry(entry);
      await ownerLock.checkAuditEntry(entry);
      await temporalRaidLock.checkAuditEntry(entry);
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "guildAuditLogEntryCreate handler error", { error: err });
    }
  });

  // Invite create/delete - Invite tracker, anti-invite shield
  client.on("inviteCreate", async (invite) => {
    try {
      await inviteTracker.trackInviteCreate(invite);
      await antiInviteShield.checkInvite(invite);
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "inviteCreate handler error", { error: err });
    }
  });

  client.on("inviteDelete", async (invite) => {
    try {
      await inviteTracker.trackInviteDelete(invite);
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "inviteDelete handler error", { error: err });
    }
  });

  // Bot token rotation - periodic check
  setInterval(async () => {
    try {
      await botTokenRotation.checkAndRotate();
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "Bot token rotation error", { error: err });
    }
  }, 60 * 60 * 1000); // Every hour

  // Daily backup - periodic
  setInterval(async () => {
    try {
      await dailyBackup.runScheduledBackups();
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "Daily backup error", { error: err });
    }
  }, 60 * 60 * 1000); // Every hour

  // Canary token check - periodic
  setInterval(async () => {
    try {
      await canaryToken.checkTokens();
    } catch (err) {
      logger.error({ module: "ShardWorker" }, "Canary token check error", { error: err });
    }
  }, 5 * 60 * 1000); // Every 5 minutes
}

function getEventPriority(eventType: string): "low" | "normal" | "high" | "critical" {
  const criticalEvents = ["GUILD_BAN_ADD", "GUILD_ROLE_DELETE", "CHANNEL_DELETE", "GUILD_MEMBER_REMOVE"];
  const highEvents = ["GUILD_ROLE_CREATE", "GUILD_ROLE_UPDATE", "CHANNEL_CREATE", "CHANNEL_UPDATE", "WEBHOOKS_UPDATE"];
  const normalEvents = ["MESSAGE_CREATE", "MESSAGE_UPDATE", "MESSAGE_DELETE", "PRESENCE_UPDATE", "VOICE_STATE_UPDATE"];

  if (criticalEvents.includes(eventType)) return "critical";
  if (highEvents.includes(eventType)) return "high";
  if (normalEvents.includes(eventType)) return "normal";
  return "low";
}

async function main() {
  const shardIdsEnv = process.env.SHARD_IDS;
  const totalShardsEnv = process.env.TOTAL_SHARDS;
  const workerId = process.env.WORKER_ID;

  if (!shardIdsEnv || !totalShardsEnv) {
    logger.error({ module: "ShardWorker" }, "Missing SHARD_IDS or TOTAL_SHARDS environment variables");
    process.exit(1);
  }

  const [firstShardStr, lastShardStr] = shardIdsEnv.split("-");
  const firstShard = parseInt(firstShardStr, 10);
  const lastShard = parseInt(lastShardStr, 10);
  const totalShards = parseInt(totalShardsEnv, 10);

  const shardIds = Array.from({ length: lastShard - firstShard + 1 }, (_, i) => firstShard + i);

  logger.info({ module: "ShardWorker" }, `Starting worker ${workerId} with shards ${shardIds.join(",")} of ${totalShards}`);

  try {
    const cppEngine = new CppNativeEngine();
    await cppEngine.initialize();
    logger.info({ module: "ShardWorker" }, "✅ C++ Native Engine initialized");

    await initializeSecurityEngines();

    const client = await createShardedClient(shardIds, totalShards);
    setupEventHandlers(client);

    client.once("ready", () => {
      logger.info({ module: "ShardWorker" }, `Worker ${workerId} ready on ${client.shards.size} shards`);
      
      if (process.send) {
        process.send({
          type: "READY",
          guildCount: client.guilds.cache.size,
          memberCount: client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0)
        });
      }
    });

    await client.login(process.env.DISCORD_TOKEN);

    logger.info({ module: "ShardWorker" }, "Bot logged in successfully");

    process.on("SIGTERM", async () => {
      logger.info({ module: "ShardWorker" }, "SIGTERM received, shutting down...");
      await client.destroy();
      await cppEngine.shutdown();
      process.exit(0);
    });

    process.on("SIGINT", async () => {
      logger.info({ module: "ShardWorker" }, "SIGINT received, shutting down...");
      await client.destroy();
      await cppEngine.shutdown();
      process.exit(0);
    });

  } catch (err) {
    logger.error({ module: "ShardWorker" }, "Worker startup failed", { error: err });
    process.exit(1);
  }
}

main();