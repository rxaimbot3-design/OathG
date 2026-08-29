/**
 * Dependency Injection Container
 * Uses inversify for proper dependency management
 * Replaces singleton pattern with constructor injection
 */

import "reflect-metadata";
import { Container, injectable, inject, interfaces } from "inversify";
import { TokenVault } from "./modules/token-vault.js";
import { OwnerLock } from "./modules/owner-lock.js";
import { RateLimiter } from "./modules/rate-limiter.js";
import { BehaviorScoring } from "./modules/behavior-scoring.js";
import { SentimentTracker } from "./modules/sentiment-tracker.js";
import { NukeDefense } from "./modules/nuke-defense.js";
import { WebhookGuard } from "./modules/webhook-guard.js";
import { Quarantine } from "./modules/quarantine.js";
import { TemporalRaidLock } from "./modules/temporal-raid-lock.js";
import { InviteTrackerEngine } from "./modules/invite-tracker-engine.js";
import { ServerSnapshotRestore } from "./modules/server-snapshot-restore.js";
import { IPBanSystem } from "./modules/ip-ban-system.js";
import { AdminWhitelistSystem } from "./modules/admin-whitelist.js";
import { AntiPhishing } from "./modules/anti-phishing.js";
import { CanaryToken } from "./modules/canary-token.js";
import { GlobalIntelligence } from "./modules/global-intelligence.js";
import { AIDeepScan } from "./modules/ai-deep-scan.js";
import { HoneypotAdminRole } from "./modules/honeypot-admin-role.js";
import { SessionHijackDetector } from "./modules/session-hijack-detector.js";
import { OAuthMaliciousAppDetector } from "./modules/oauth-malicious-app-detector.js";
import { AutoPermissionRollback } from "./modules/auto-permission-rollback.js";
import { AutoHeal } from "./modules/auto-heal.js";
import { AntiVanityHijack } from "./modules/anti-vanity-hijack.js";
import { EmojiStickerProtection } from "./modules/emoji-sticker-protection.js";
import { ForumChannelProtection } from "./modules/forum-channel-protection.js";
import { AIRaidPrediction } from "./modules/ai-raid-prediction.js";
import { AISecurityReport } from "./modules/ai-security-report.js";
import { AICommandAssistant } from "./modules/ai-command-assistant.js";
import { BotTokenRotationSystem } from "./modules/bot-token-rotation.js";
import { AutoBackupEngine } from "./modules/auto-backup-engine.js";
import { DailyBackup } from "./modules/daily-backup.js";
import { MongoRedisEngine } from "./modules/mongo-redis-engine.js";
import { PremiumLicenseSystem } from "./modules/premium-license-system.js";
import { IPWhitelist } from "./modules/basic-filters.js";
import { DMFirewall } from "./modules/basic-filters.js";
import { SlashOnly } from "./modules/basic-filters.js";
import { RedisPersistence } from "./modules/redis-persistence.js";
import { AuditLogMonitor } from "./modules/audit-log-monitor.js";
import { AnomalyAI } from "./modules/anomaly-ai.js";
import { JoinLimitShield } from "./modules/join-limit-shield.js";
import { AntiInviteShield } from "./modules/anti-invite-shield.js";

export const TYPES = {
  // Core services
  RedisPersistence: Symbol.for("RedisPersistence"),
  TokenVault: Symbol.for("TokenVault"),
  OwnerLock: Symbol.for("OwnerLock"),
  
  // Security modules
  RateLimiter: Symbol.for("RateLimiter"),
  BehaviorScoring: Symbol.for("BehaviorScoring"),
  SentimentTracker: Symbol.for("SentimentTracker"),
  NukeDefense: Symbol.for("NukeDefense"),
  WebhookGuard: Symbol.for("WebhookGuard"),
  Quarantine: Symbol.for("Quarantine"),
  TemporalRaidLock: Symbol.for("TemporalRaidLock"),
  InviteTrackerEngine: Symbol.for("InviteTrackerEngine"),
  ServerSnapshotRestore: Symbol.for("ServerSnapshotRestore"),
  IPBanSystem: Symbol.for("IPBanSystem"),
  AdminWhitelistSystem: Symbol.for("AdminWhitelistSystem"),
  AntiPhishing: Symbol.for("AntiPhishing"),
  CanaryToken: Symbol.for("CanaryToken"),
  GlobalIntelligence: Symbol.for("GlobalIntelligence"),
  AIDeepScan: Symbol.for("AIDeepScan"),
  HoneypotAdminRole: Symbol.for("HoneypotAdminRole"),
  SessionHijackDetector: Symbol.for("SessionHijackDetector"),
  OAuthMaliciousAppDetector: Symbol.for("OAuthMaliciousAppDetector"),
  AutoPermissionRollback: Symbol.for("AutoPermissionRollback"),
  AutoHeal: Symbol.for("AutoHeal"),
  AntiVanityHijack: Symbol.for("AntiVanityHijack"),
  EmojiStickerProtection: Symbol.for("EmojiStickerProtection"),
  ForumChannelProtection: Symbol.for("ForumChannelProtection"),
  AIRaidPrediction: Symbol.for("AIRaidPrediction"),
  AISecurityReport: Symbol.for("AISecurityReport"),
  AICommandAssistant: Symbol.for("AICommandAssistant"),
  BotTokenRotationSystem: Symbol.for("BotTokenRotationSystem"),
  AutoBackupEngine: Symbol.for("AutoBackupEngine"),
  DailyBackup: Symbol.for("DailyBackup"),
  MongoRedisEngine: Symbol.for("MongoRedisEngine"),
  PremiumLicenseSystem: Symbol.for("PremiumLicenseSystem"),
  IPWhitelist: Symbol.for("IPWhitelist"),
  DMFirewall: Symbol.for("DMFirewall"),
  SlashOnly: Symbol.for("SlashOnly"),
  AuditLogMonitor: Symbol.for("AuditLogMonitor"),
  AnomalyAI: Symbol.for("AnomalyAI"),
  JoinLimitShield: Symbol.for("JoinLimitShield"),
  AntiInviteShield: Symbol.for("AntiInviteShield"),
} as const;

export class DIContainer {
  private static instance: DIContainer;
  private container: Container;
  private initialized = false;

  private constructor() {
    this.container = new Container({ defaultScope: "Singleton" });
    this.bindCoreServices();
    this.bindSecurityModules();
  }

  static getInstance(): DIContainer {
    if (!DIContainer.instance) {
      DIContainer.instance = new DIContainer();
    }
    return DIContainer.instance;
  }

  static resetInstance(): void {
    DIContainer.instance = undefined as any;
  }

  getContainer(): Container {
    return this.container;
  }

  private bindCoreServices(): void {
    // Redis Persistence - foundation for all state
    this.container.bind<RedisPersistence>(TYPES.RedisPersistence)
      .to(RedisPersistence)
      .inSingletonScope();

    // TokenVault - depends on RedisPersistence and OwnerLock
    this.container.bind<TokenVault>(TYPES.TokenVault)
      .toDynamicValue(async (context: interfaces.Context) => {
        const persistence = await context.container.getAsync<TYPES.RedisPersistence>(TYPES.RedisPersistence);
        const ownerLock = await context.container.getAsync<OwnerLock>(TYPES.OwnerLock);
        const vault = TokenVault.getInstance();
        // The singleton already handles persistence internally
        return vault;
      })
      .inSingletonScope();

    // OwnerLock - no dependencies
    this.container.bind<OwnerLock>(TYPES.OwnerLock)
      .toDynamicValue(() => OwnerLock.getInstance())
      .inSingletonScope();
  }

  private bindSecurityModules(): void {
    // RateLimiter
    this.container.bind<RateLimiter>(TYPES.RateLimiter)
      .toDynamicValue(async (context: interfaces.Context) => {
        const limiter = RateLimiter.getInstance();
        await limiter.initialize();
        return limiter;
      })
      .inSingletonScope();

    // BehaviorScoring
    this.container.bind<BehaviorScoring>(TYPES.BehaviorScoring)
      .toDynamicValue(async (context: interfaces.Context) => {
        const scoring = BehaviorScoring.getInstance();
        await scoring.initialize();
        return scoring;
      })
      .inSingletonScope();

    // SentimentTracker
    this.container.bind<SentimentTracker>(TYPES.SentimentTracker)
      .toDynamicValue(async (context: interfaces.Context) => {
        const tracker = SentimentTracker.getInstance();
        await tracker.initialize();
        return tracker;
      })
      .inSingletonScope();

    // NukeDefense
    this.container.bind<NukeDefense>(TYPES.NukeDefense)
      .toDynamicValue(() => NukeDefense.getInstance())
      .inSingletonScope();

    // WebhookGuard
    this.container.bind<WebhookGuard>(TYPES.WebhookGuard)
      .toDynamicValue(() => WebhookGuard.getInstance())
      .inSingletonScope();

    // Quarantine
    this.container.bind<Quarantine>(TYPES.Quarantine)
      .toDynamicValue(() => Quarantine.getInstance())
      .inSingletonScope();

    // TemporalRaidLock
    this.container.bind<TemporalRaidLock>(TYPES.TemporalRaidLock)
      .toDynamicValue(() => TemporalRaidLock.getInstance())
      .inSingletonScope();

    // InviteTrackerEngine
    this.container.bind<InviteTrackerEngine>(TYPES.InviteTrackerEngine)
      .toDynamicValue(async (context: interfaces.Context) => {
        const tracker = InviteTrackerEngine.getInstance();
        await tracker.initialize();
        return tracker;
      })
      .inSingletonScope();

    // ServerSnapshotRestore
    this.container.bind<ServerSnapshotRestore>(TYPES.ServerSnapshotRestore)
      .toDynamicValue(() => ServerSnapshotRestore.getInstance())
      .inSingletonScope();

    // IPBanSystem
    this.container.bind<IPBanSystem>(TYPES.IPBanSystem)
      .toDynamicValue(() => IPBanSystem.getInstance())
      .inSingletonScope();

    // AdminWhitelistSystem
    this.container.bind<AdminWhitelistSystem>(TYPES.AdminWhitelistSystem)
      .toDynamicValue(() => AdminWhitelistSystem.getInstance())
      .inSingletonScope();

    // AntiPhishing
    this.container.bind<AntiPhishing>(TYPES.AntiPhishing)
      .toDynamicValue(() => AntiPhishing.getInstance())
      .inSingletonScope();

    // CanaryToken
    this.container.bind<CanaryToken>(TYPES.CanaryToken)
      .toDynamicValue(() => CanaryToken.getInstance())
      .inSingletonScope();

    // GlobalIntelligence
    this.container.bind<GlobalIntelligence>(TYPES.GlobalIntelligence)
      .toDynamicValue(() => GlobalIntelligence.getInstance())
      .inSingletonScope();

    // AIDeepScan
    this.container.bind<AIDeepScan>(TYPES.AIDeepScan)
      .toDynamicValue(() => AIDeepScan.getInstance())
      .inSingletonScope();

    // HoneypotAdminRole
    this.container.bind<HoneypotAdminRole>(TYPES.HoneypotAdminRole)
      .toDynamicValue(() => HoneypotAdminRole.getInstance())
      .inSingletonScope();

    // SessionHijackDetector
    this.container.bind<SessionHijackDetector>(TYPES.SessionHijackDetector)
      .toDynamicValue(() => SessionHijackDetector.getInstance())
      .inSingletonScope();

    // OAuthMaliciousAppDetector
    this.container.bind<OAuthMaliciousAppDetector>(TYPES.OAuthMaliciousAppDetector)
      .toDynamicValue(() => OAuthMaliciousAppDetector.getInstance())
      .inSingletonScope();

    // AutoPermissionRollback
    this.container.bind<AutoPermissionRollback>(TYPES.AutoPermissionRollback)
      .toDynamicValue(() => AutoPermissionRollback.getInstance())
      .inSingletonScope();

    // AutoHeal
    this.container.bind<AutoHeal>(TYPES.AutoHeal)
      .toDynamicValue(() => AutoHeal.getInstance())
      .inSingletonScope();

    // AntiVanityHijack
    this.container.bind<AntiVanityHijack>(TYPES.AntiVanityHijack)
      .toDynamicValue(() => AntiVanityHijack.getInstance())
      .inSingletonScope();

    // EmojiStickerProtection
    this.container.bind<EmojiStickerProtection>(TYPES.EmojiStickerProtection)
      .toDynamicValue(() => EmojiStickerProtection.getInstance())
      .inSingletonScope();

    // ForumChannelProtection
    this.container.bind<ForumChannelProtection>(TYPES.ForumChannelProtection)
      .toDynamicValue(() => ForumChannelProtection.getInstance())
      .inSingletonScope();

    // AIRaidPrediction
    this.container.bind<AIRaidPrediction>(TYPES.AIRaidPrediction)
      .toDynamicValue(() => AIRaidPrediction.getInstance())
      .inSingletonScope();

    // AISecurityReport
    this.container.bind<AISecurityReport>(TYPES.AISecurityReport)
      .toDynamicValue(() => AISecurityReport.getInstance())
      .inSingletonScope();

    // AICommandAssistant
    this.container.bind<AICommandAssistant>(TYPES.AICommandAssistant)
      .toDynamicValue(() => AICommandAssistant.getInstance())
      .inSingletonScope();

    // BotTokenRotationSystem
    this.container.bind<BotTokenRotationSystem>(TYPES.BotTokenRotationSystem)
      .toDynamicValue(() => BotTokenRotationSystem.getInstance())
      .inSingletonScope();

    // AutoBackupEngine
    this.container.bind<AutoBackupEngine>(TYPES.AutoBackupEngine)
      .toDynamicValue(() => AutoBackupEngine.getInstance())
      .inSingletonScope();

    // DailyBackup
    this.container.bind<DailyBackup>(TYPES.DailyBackup)
      .toDynamicValue(() => DailyBackup.getInstance())
      .inSingletonScope();

    // MongoRedisEngine
    this.container.bind<MongoRedisEngine>(TYPES.MongoRedisEngine)
      .toDynamicValue(() => MongoRedisEngine.getInstance())
      .inSingletonScope();

    // PremiumLicenseSystem
    this.container.bind<PremiumLicenseSystem>(TYPES.PremiumLicenseSystem)
      .toDynamicValue(() => PremiumLicenseSystem.getInstance())
      .inSingletonScope();

    // IPWhitelist
    this.container.bind<IPWhitelist>(TYPES.IPWhitelist)
      .toDynamicValue(() => IPWhitelist.getInstance())
      .inSingletonScope();

    // DMFirewall
    this.container.bind<DMFirewall>(TYPES.DMFirewall)
      .toDynamicValue(() => DMFirewall.getInstance())
      .inSingletonScope();

    // SlashOnly
    this.container.bind<SlashOnly>(TYPES.SlashOnly)
      .toDynamicValue(() => SlashOnly.getInstance())
      .inSingletonScope();

    // AuditLogMonitor
    this.container.bind<AuditLogMonitor>(TYPES.AuditLogMonitor)
      .toDynamicValue(() => AuditLogMonitor.getInstance())
      .inSingletonScope();

    // AnomalyAI
    this.container.bind<AnomalyAI>(TYPES.AnomalyAI)
      .toDynamicValue(() => AnomalyAI.getInstance())
      .inSingletonScope();

    // JoinLimitShield
    this.container.bind<JoinLimitShield>(TYPES.JoinLimitShield)
      .toDynamicValue(() => JoinLimitShield.getInstance())
      .inSingletonScope();

    // AntiInviteShield
    this.container.bind<AntiInviteShield>(TYPES.AntiInviteShield)
      .toDynamicValue(() => AntiInviteShield.getInstance())
      .inSingletonScope();
  }

  async initializeAll(): Promise<void> {
    if (this.initialized) return;
    
    // Initialize core services first
    const persistence = this.container.get<RedisPersistence>(TYPES.RedisPersistence);
    await persistence.connect();

    // Initialize all security modules that need async init
    const rateLimiter = this.container.get<RateLimiter>(TYPES.RateLimiter);
    await rateLimiter.initialize();

    const behaviorScoring = this.container.get<BehaviorScoring>(TYPES.BehaviorScoring);
    await behaviorScoring.initialize();

    const sentimentTracker = this.container.get<SentimentTracker>(TYPES.SentimentTracker);
    await sentimentTracker.initialize();

    const inviteTracker = this.container.get<InviteTrackerEngine>(TYPES.InviteTrackerEngine);
    await inviteTracker.initialize();

    const tokenVault = this.container.get<TokenVault>(TYPES.TokenVault);
    await tokenVault.initialize();

    this.initialized = true;
    console.log("[DIContainer] All services initialized");
  }

  // Helper to get services with proper typing
  get<T>(type: symbol): T {
    return this.container.get<T>(type);
  }

  async getAsync<T>(type: symbol): Promise<T> {
    return this.container.getAsync<T>(type);
  }

  // For testing - create child container with overrides
  createChildContainer(): Container {
    return this.container.createChild();
  }

  // Rebind a service (useful for testing)
  rebind<T>(type: symbol, implementation: new (...args: any[]) => T): void {
    this.container.rebind(type).to(implementation).inSingletonScope();
  }

  // Rebind to a constant value (useful for testing mocks)
  rebindConstant<T>(type: symbol, value: T): void {
    this.container.rebind(type).toConstantValue(value);
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

// Decorator for easy injection in classes
export function Inject(type: symbol) {
  return inject(type);
}

export function Injectable() {
  return injectable();
}