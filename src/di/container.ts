/**
 * Dependency Injection Container
 * Uses inversify for proper dependency management
 * Replaces singleton pattern with constructor injection
 */

import "reflect-metadata";
import { Container, injectable, inject } from "inversify";
import { TokenVault } from "../security/modules/token-vault.js";
import { OwnerLock } from "../security/modules/owner-lock.js";
import { RateLimiter } from "../security/modules/rate-limiter.js";
import { BehaviorScoring } from "../security/modules/behavior-scoring.js";
import { SentimentTracker } from "../security/modules/sentiment-tracker.js";
import { NukeDefense } from "../security/modules/nuke-defense.js";
import { WebhookGuard } from "../security/modules/webhook-guard.js";
import { Quarantine } from "../security/modules/quarantine.js";
import { TemporalRaidLock } from "../security/modules/temporal-raid-lock.js";
import { InviteTrackerEngine } from "../security/modules/invite-tracker-engine.js";
import { ServerSnapshotRestore } from "../security/modules/server-snapshot-restore.js";
import { IPBanSystem } from "../security/modules/ip-ban-system.js";
import { AdminWhitelistSystem } from "../security/modules/admin-whitelist.js";
import { AntiPhishing } from "../security/modules/anti-phishing.js";
import { CanaryToken } from "../security/modules/canary-token.js";
import { GlobalIntelligence } from "../security/modules/global-intelligence.js";
import { AIDeepScan } from "../security/modules/ai-deep-scan.js";
import { HoneypotAdminRole } from "../security/modules/honeypot-admin-role.js";
import { SessionHijackDetector } from "../security/modules/session-hijack-detector.js";
import { OAuthMaliciousAppDetector } from "../security/modules/oauth-malicious-app-detector.js";
import { AutoPermissionRollback } from "../security/modules/auto-permission-rollback.js";
import { AutoHeal } from "../security/modules/auto-heal.js";
import { AntiVanityHijack } from "../security/modules/anti-vanity-hijack.js";
import { EmojiStickerProtection } from "../security/modules/emoji-sticker-protection.js";
import { ForumChannelProtection } from "../security/modules/forum-channel-protection.js";
import { AIRaidPrediction } from "../security/modules/ai-raid-prediction.js";
import { AISecurityReport } from "../security/modules/ai-security-report.js";
import { AICommandAssistant } from "../security/modules/ai-command-assistant.js";
import { BotTokenRotationSystem } from "../security/modules/bot-token-rotation.js";
import { AutoBackupEngine } from "../security/modules/auto-backup-engine.js";
import { DailyBackup } from "../security/modules/daily-backup.js";
import { MongoRedisEngine } from "../security/modules/mongo-redis-engine.js";
import { PremiumLicenseSystem } from "../security/modules/premium-license-system.js";
import { IPWhitelist } from "../security/modules/basic-filters.js";
import { DMFirewall } from "../security/modules/basic-filters.js";
import { SlashOnly } from "../security/modules/basic-filters.js";
import { RedisPersistence } from "../security/modules/redis-persistence.js";
import { AuditLogMonitor } from "../security/modules/audit-log-monitor.js";
import { AnomalyAI } from "../security/modules/anomaly-ai.js";
import { JoinLimitShield } from "../security/modules/join-limit-shield.js";
import { AntiInviteShield } from "../security/modules/anti-invite-shield.js";

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
      .toConstantValue(RedisPersistence.getInstance());

    // TokenVault
    this.container.bind<TokenVault>(TYPES.TokenVault)
      .toConstantValue(TokenVault.getInstance());

    // OwnerLock
    this.container.bind<OwnerLock>(TYPES.OwnerLock)
      .toConstantValue(OwnerLock.getInstance());
  }

  private bindSecurityModules(): void {
    // RateLimiter
    this.container.bind<RateLimiter>(TYPES.RateLimiter)
      .toConstantValue(RateLimiter.getInstance());

    // BehaviorScoring
    this.container.bind<BehaviorScoring>(TYPES.BehaviorScoring)
      .toConstantValue(BehaviorScoring.getInstance());

    // SentimentTracker
    this.container.bind<SentimentTracker>(TYPES.SentimentTracker)
      .toConstantValue(SentimentTracker.getInstance());

    // NukeDefense
    this.container.bind<NukeDefense>(TYPES.NukeDefense)
      .toConstantValue(NukeDefense.getInstance());

    // WebhookGuard
    this.container.bind<WebhookGuard>(TYPES.WebhookGuard)
      .toConstantValue(WebhookGuard.getInstance());

    // Quarantine
    this.container.bind<Quarantine>(TYPES.Quarantine)
      .toConstantValue(Quarantine.getInstance());

    // TemporalRaidLock
    this.container.bind<TemporalRaidLock>(TYPES.TemporalRaidLock)
      .toConstantValue(TemporalRaidLock.getInstance());

    // InviteTrackerEngine
    this.container.bind<InviteTrackerEngine>(TYPES.InviteTrackerEngine)
      .toConstantValue(InviteTrackerEngine.getInstance());

    // ServerSnapshotRestore
    this.container.bind<ServerSnapshotRestore>(TYPES.ServerSnapshotRestore)
      .toConstantValue(ServerSnapshotRestore.getInstance());

    // IPBanSystem
    this.container.bind<IPBanSystem>(TYPES.IPBanSystem)
      .toConstantValue(IPBanSystem.getInstance());

    // AdminWhitelistSystem
    this.container.bind<AdminWhitelistSystem>(TYPES.AdminWhitelistSystem)
      .toConstantValue(AdminWhitelistSystem.getInstance());

    // AntiPhishing
    this.container.bind<AntiPhishing>(TYPES.AntiPhishing)
      .toConstantValue(AntiPhishing.getInstance());

    // CanaryToken
    this.container.bind<CanaryToken>(TYPES.CanaryToken)
      .toConstantValue(CanaryToken.getInstance());

    // GlobalIntelligence
    this.container.bind<GlobalIntelligence>(TYPES.GlobalIntelligence)
      .toConstantValue(GlobalIntelligence.getInstance());

    // AIDeepScan
    this.container.bind<AIDeepScan>(TYPES.AIDeepScan)
      .toConstantValue(AIDeepScan.getInstance());

    // HoneypotAdminRole
    this.container.bind<HoneypotAdminRole>(TYPES.HoneypotAdminRole)
      .toConstantValue(HoneypotAdminRole.getInstance());

    // SessionHijackDetector
    this.container.bind<SessionHijackDetector>(TYPES.SessionHijackDetector)
      .toConstantValue(SessionHijackDetector.getInstance());

    // OAuthMaliciousAppDetector
    this.container.bind<OAuthMaliciousAppDetector>(TYPES.OAuthMaliciousAppDetector)
      .toConstantValue(OAuthMaliciousAppDetector.getInstance());

    // AutoPermissionRollback
    this.container.bind<AutoPermissionRollback>(TYPES.AutoPermissionRollback)
      .toConstantValue(AutoPermissionRollback.getInstance());

    // AutoHeal
    this.container.bind<AutoHeal>(TYPES.AutoHeal)
      .toConstantValue(AutoHeal.getInstance());

    // AntiVanityHijack
    this.container.bind<AntiVanityHijack>(TYPES.AntiVanityHijack)
      .toConstantValue(AntiVanityHijack.getInstance());

    // EmojiStickerProtection
    this.container.bind<EmojiStickerProtection>(TYPES.EmojiStickerProtection)
      .toConstantValue(EmojiStickerProtection.getInstance());

    // ForumChannelProtection
    this.container.bind<ForumChannelProtection>(TYPES.ForumChannelProtection)
      .toConstantValue(ForumChannelProtection.getInstance());

    // AIRaidPrediction
    this.container.bind<AIRaidPrediction>(TYPES.AIRaidPrediction)
      .toConstantValue(AIRaidPrediction.getInstance());

    // AISecurityReport
    this.container.bind<AISecurityReport>(TYPES.AISecurityReport)
      .toConstantValue(AISecurityReport.getInstance());

    // AICommandAssistant
    this.container.bind<AICommandAssistant>(TYPES.AICommandAssistant)
      .toConstantValue(AICommandAssistant.getInstance());

    // BotTokenRotationSystem
    this.container.bind<BotTokenRotationSystem>(TYPES.BotTokenRotationSystem)
      .toConstantValue(BotTokenRotationSystem.getInstance());

    // AutoBackupEngine
    this.container.bind<AutoBackupEngine>(TYPES.AutoBackupEngine)
      .toConstantValue(AutoBackupEngine.getInstance());

    // DailyBackup
    this.container.bind<DailyBackup>(TYPES.DailyBackup)
      .toConstantValue(DailyBackup.getInstance());

    // MongoRedisEngine
    this.container.bind<MongoRedisEngine>(TYPES.MongoRedisEngine)
      .toConstantValue(MongoRedisEngine.getInstance());

    // PremiumLicenseSystem
    this.container.bind<PremiumLicenseSystem>(TYPES.PremiumLicenseSystem)
      .toConstantValue(PremiumLicenseSystem.getInstance());

    // IPWhitelist
    this.container.bind<IPWhitelist>(TYPES.IPWhitelist)
      .toConstantValue(IPWhitelist.getInstance());

    // DMFirewall
    this.container.bind<DMFirewall>(TYPES.DMFirewall)
      .toConstantValue(DMFirewall.getInstance());

    // SlashOnly
    this.container.bind<SlashOnly>(TYPES.SlashOnly)
      .toConstantValue(SlashOnly.getInstance());

    // AuditLogMonitor
    this.container.bind<AuditLogMonitor>(TYPES.AuditLogMonitor)
      .toConstantValue(AuditLogMonitor.getInstance());

    // AnomalyAI
    this.container.bind<AnomalyAI>(TYPES.AnomalyAI)
      .toConstantValue(AnomalyAI.getInstance());

    // JoinLimitShield
    this.container.bind<JoinLimitShield>(TYPES.JoinLimitShield)
      .toConstantValue(JoinLimitShield.getInstance());

    // AntiInviteShield
    this.container.bind<AntiInviteShield>(TYPES.AntiInviteShield)
      .toConstantValue(AntiInviteShield.getInstance());
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

  get<T>(type: symbol): T {
    return this.container.get<T>(type);
  }

  async getAsync<T>(type: symbol): Promise<T> {
    return this.container.getAsync<T>(type);
  }

  // For testing - create child container with overrides
  createChildContainer(): Container {
    return new Container();
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