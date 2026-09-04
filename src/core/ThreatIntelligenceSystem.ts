import { EventEmitter } from "events";
import { log, createModuleLogger } from "../logging/logger.js";

const logger = createModuleLogger("ThreatIntelligenceSystem");

export interface ThreatIntelConfig {
  enableBlockchainVerification: boolean;
  blockchainRpcUrl: string;
  blockchainContractAddress: string;
  threatFeeds: ThreatFeed[];
  updateInterval: number;
  maxThreatAge: number;
  confidenceThreshold: number;
  enableMLClassification: boolean;
  enableBehavioralAnalysis: boolean;
}

export interface ThreatFeed {
  id: string;
  name: string;
  url: string;
  type: "malware" | "phishing" | "botnet" | "c2" | "exploit" | "vulnerability" | "actor" | "custom";
  format: "json" | "stix" | "csv" | "txt";
  apiKey?: string;
  enabled: boolean;
  updateInterval: number;
  trustLevel: number;
}

export interface ThreatIndicator {
  id: string;
  type: "ip" | "domain" | "url" | "hash" | "email" | "user_agent" | "discord_id" | "webhook" | "token";
  value: string;
  confidence: number;
  severity: "low" | "medium" | "high" | "critical";
  tags: string[];
  source: string;
  firstSeen: number;
  lastSeen: number;
  description: string;
  context: Record<string, any>;
  blockchainVerified: boolean;
  blockchainTxHash?: string;
}

export interface ThreatActor {
  id: string;
  name: string;
  aliases: string[];
  motivation: "financial" | "espionage" | "hacktivism" | "destruction" | "unknown";
  sophistication: "low" | "medium" | "high" | "nation_state";
  originCountry?: string;
  targetSectors: string[];
  knownTools: string[];
  knownIndicators: string[];
  firstObserved: number;
  lastActivity: number;
  confidence: number;
}

export interface ThreatCampaign {
  id: string;
  name: string;
  actorId?: string;
  objective: string;
  targetGuilds: string[];
  indicators: string[];
  startDate: number;
  endDate?: number;
  status: "active" | "dormant" | "completed" | "disrupted";
  impact: "low" | "medium" | "high" | "critical";
  confidence: number;
}

export interface BlockchainAuditEntry {
  id: string;
  timestamp: number;
  eventType: string;
  guildId: string;
  userId: string;
  action: string;
  data: any;
  hash: string;
  blockNumber?: number;
  txHash?: string;
  verified: boolean;
}

export interface ThreatIntelStats {
  totalIndicators: number;
  indicatorsByType: Record<string, number>;
  indicatorsBySeverity: Record<string, number>;
  activeActors: number;
  activeCampaigns: number;
  blockchainVerified: number;
  lastUpdate: number;
  feedStatus: Record<string, { lastUpdate: number; indicatorsCount: number; status: "ok" | "error" | "stale" }>;
}

interface ThreatIntelligenceEvents {
  feedsUpdated: [Record<string, { lastUpdate: number; indicatorsCount: number; status: "ok" | "error" | "stale" }>];
  indicatorAdded: [ThreatIndicator];
  indicatorMatched: [ThreatIndicator];
  actorAdded: [ThreatActor];
  campaignAdded: [ThreatCampaign];
  auditLogged: [BlockchainAuditEntry];
}

export class ThreatIntelligenceSystem extends EventEmitter<ThreatIntelligenceEvents> {
  private static instance: ThreatIntelligenceSystem;
  
  private config: ThreatIntelConfig = {
    enableBlockchainVerification: false,
    blockchainRpcUrl: "",
    blockchainContractAddress: "",
    threatFeeds: [],
    updateInterval: 3600000,
    maxThreatAge: 30 * 24 * 60 * 60 * 1000,
    confidenceThreshold: 0.7,
    enableMLClassification: true,
    enableBehavioralAnalysis: true
  };
  
  private indicators = new Map<string, ThreatIndicator>();
  private actors = new Map<string, ThreatActor>();
  private campaigns = new Map<string, ThreatCampaign>();
  private auditLog: BlockchainAuditEntry[] = [];
  private feedStatus = new Map<string, { lastUpdate: number; indicatorsCount: number; status: "ok" | "error" | "stale" }>();
  private updateInterval: NodeJS.Timeout | null = null;
  private blockchainClient: any = null;
  
  private constructor() {
    super();
    this.initializeDefaultFeeds();
  }
  
  static getInstance(): ThreatIntelligenceSystem {
    if (!ThreatIntelligenceSystem.instance) {
      ThreatIntelligenceSystem.instance = new ThreatIntelligenceSystem();
    }
    return ThreatIntelligenceSystem.instance;
  }
  
  configure(config: Partial<ThreatIntelConfig>) {
    this.config = { ...this.config, ...config };
    if (config.enableBlockchainVerification && config.blockchainRpcUrl) {
      this.initializeBlockchain();
    }
    log.info({ module: "ThreatIntelligenceSystem" }, "ThreatIntelligenceSystem configured", { 
      feedsEnabled: this.config.threatFeeds.filter(f => f.enabled).length,
      blockchainEnabled: this.config.enableBlockchainVerification
    });
  }
  
  private initializeDefaultFeeds() {
    this.config.threatFeeds = [
      {
        id: "alienvault_otx",
        name: "AlienVault OTX",
        url: "https://otx.alienvault.com/api/v1/pulses/subscribed",
        type: "malware",
        format: "json",
        enabled: false,
        updateInterval: 3600000,
        trustLevel: 0.9
      },
      {
        id: "abuse_ch",
        name: "Abuse.ch",
        url: "https://feodotracker.abuse.ch/downloads/ipblocklist.json",
        type: "botnet",
        format: "json",
        enabled: false,
        updateInterval: 1800000,
        trustLevel: 0.85
      },
      {
        id: "discord_threats",
        name: "Discord Threat Intelligence",
        url: "https://api.discord.threats/v1/indicators",
        type: "custom",
        format: "json",
        enabled: false,
        updateInterval: 600000,
        trustLevel: 0.95
      }
    ];
  }
  
  private async initializeBlockchain() {
    log.info({ module: "ThreatIntelligenceSystem" }, "Initializing blockchain verification", { 
      rpcUrl: this.config.blockchainRpcUrl 
    });
  }
  
  async start() {
    await this.updateAllFeeds();
    this.updateInterval = setInterval(() => this.updateAllFeeds(), this.config.updateInterval);
    this.startCleanupInterval();
    log.info({ module: "ThreatIntelligenceSystem" }, "ThreatIntelligenceSystem started");
  }
  
  private startCleanupInterval() {
    setInterval(() => this.cleanupOldIndicators(), 3600000);
  }
  
  private async updateAllFeeds() {
    for (const feed of this.config.threatFeeds) {
      if (!feed.enabled) continue;
      try {
        await this.updateFeed(feed);
        this.feedStatus.set(feed.id, { 
          lastUpdate: Date.now(), 
          indicatorsCount: this.indicators.size, 
          status: "ok" 
        });
      } catch (err) {
        log.error({ module: "ThreatIntelligenceSystem" }, "Feed update failed", { feedId: feed.id, error: err });
        this.feedStatus.set(feed.id, { 
          lastUpdate: Date.now(), 
          indicatorsCount: 0, 
          status: "error" 
        });
      }
    }
    this.emit("feedsUpdated", this.getFeedStatus());
  }
  
  private async updateFeed(feed: ThreatFeed) {
    log.debug({ module: "ThreatIntelligenceSystem" }, "Updating threat feed", { feedId: feed.id });
  }
  
  addIndicator(indicator: Omit<ThreatIndicator, "id" | "firstSeen" | "lastSeen" | "blockchainVerified" | "blockchainTxHash">): ThreatIndicator {
    const now = Date.now();
    const id = `ti_${indicator.type}_${this.hashValue(indicator.value)}_${now}`;
    
    const fullIndicator: ThreatIndicator = {
      ...indicator,
      id,
      firstSeen: now,
      lastSeen: now,
      blockchainVerified: false
    };
    
    this.indicators.set(id, fullIndicator);
    
    if (this.config.enableBlockchainVerification) {
      this.verifyOnBlockchain(fullIndicator);
    }
    
    this.emit("indicatorAdded", fullIndicator);
    log.info({ module: "ThreatIntelligenceSystem" }, "Threat indicator added", { id, type: indicator.type, value: indicator.value });
    
    return fullIndicator;
  }
  
  private async verifyOnBlockchain(indicator: ThreatIndicator) {
    try {
      const data = JSON.stringify({ indicator });
      const hash = this.hashValue(data);
      
      if (this.blockchainClient) {
        const tx = await this.blockchainClient.sendTransaction({
          to: this.config.blockchainContractAddress,
          data: `0x${hash}`
        });
        indicator.blockchainVerified = true;
        indicator.blockchainTxHash = tx.hash;
      }
    } catch (err) {
      log.error({ module: "ThreatIntelligenceSystem" }, "Blockchain verification failed", { indicatorId: indicator.id, error: err });
    }
  }
  
  checkIndicator(type: ThreatIndicator["type"], value: string): ThreatIndicator | null {
    const key = `${type}:${value}`;
    const indicator = this.indicators.get(key);
    
    if (indicator) {
      indicator.lastSeen = Date.now();
      if (indicator.confidence >= this.config.confidenceThreshold) {
        this.emit("indicatorMatched", indicator);
        return indicator;
      }
    }
    
    return null;
  }
  
  bulkCheck(indicators: Array<{ type: ThreatIndicator["type"]; value: string }>): ThreatIndicator[] {
    const matches: ThreatIndicator[] = [];
    for (const ind of indicators) {
      const match = this.checkIndicator(ind.type, ind.value);
      if (match) matches.push(match);
    }
    return matches;
  }
  
  addActor(actor: Omit<ThreatActor, "id" | "firstObserved" | "lastActivity">): ThreatActor {
    const id = `actor_${this.hashValue(actor.name)}_${Date.now()}`;
    const fullActor: ThreatActor = {
      ...actor,
      id,
      firstObserved: Date.now(),
      lastActivity: Date.now()
    };
    
    this.actors.set(id, fullActor);
    this.emit("actorAdded", fullActor);
    return fullActor;
  }
  
  addCampaign(campaign: Omit<ThreatCampaign, "id">): ThreatCampaign {
    const id = `campaign_${this.hashValue(campaign.name)}_${Date.now()}`;
    const fullCampaign: ThreatCampaign = { ...campaign, id };
    
    this.campaigns.set(id, fullCampaign);
    this.emit("campaignAdded", fullCampaign);
    return fullCampaign;
  }
  
  async logAuditEntry(entry: Omit<BlockchainAuditEntry, "id" | "timestamp" | "hash" | "blockNumber" | "txHash" | "verified">): Promise<BlockchainAuditEntry> {
    const timestamp = Date.now();
    const data = JSON.stringify({ ...entry, timestamp });
    const hash = this.hashValue(data);
    
    const auditEntry: BlockchainAuditEntry = {
      ...entry,
      id: `audit_${hash.slice(0, 16)}`,
      timestamp,
      hash,
      verified: false
    };
    
    this.auditLog.push(auditEntry);
    
    if (this.config.enableBlockchainVerification && this.blockchainClient) {
      try {
        const tx = await this.blockchainClient.sendTransaction({
          to: this.config.blockchainContractAddress,
          data: `0x${hash}`
        });
        auditEntry.verified = true;
        auditEntry.blockNumber = tx.blockNumber;
        auditEntry.txHash = tx.hash;
      } catch (err) {
        log.error({ module: "ThreatIntelligenceSystem" }, "Blockchain audit failed", { error: err });
      }
    }
    
    this.emit("auditLogged", auditEntry);
    return auditEntry;
  }
  
  verifyAuditEntry(entryId: string): BlockchainAuditEntry | null {
    const entry = this.auditLog.find(e => e.id === entryId);
    if (!entry) return null;
    
    const data = JSON.stringify({ 
      eventType: entry.eventType, 
      guildId: entry.guildId, 
      userId: entry.userId, 
      action: entry.action, 
      data: entry.data, 
      timestamp: entry.timestamp 
    });
    const computedHash = this.hashValue(data);
    
    entry.verified = computedHash === entry.hash;
    return entry;
  }
  
  getIndicatorsByType(type: ThreatIndicator["type"]): ThreatIndicator[] {
    return Array.from(this.indicators.values()).filter(i => i.type === type);
  }
  
  getIndicatorsBySeverity(severity: ThreatIndicator["severity"]): ThreatIndicator[] {
    return Array.from(this.indicators.values()).filter(i => i.severity === severity);
  }
  
  getIndicatorsByTag(tag: string): ThreatIndicator[] {
    return Array.from(this.indicators.values()).filter(i => i.tags.includes(tag));
  }
  
  searchIndicators(query: string): ThreatIndicator[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.indicators.values()).filter(i => 
      i.value.toLowerCase().includes(lowerQuery) ||
      i.description.toLowerCase().includes(lowerQuery) ||
      i.tags.some(t => t.toLowerCase().includes(lowerQuery))
    );
  }
  
  getActor(actorId: string): ThreatActor | undefined {
    return this.actors.get(actorId);
  }
  
  getAllActors(): ThreatActor[] {
    return Array.from(this.actors.values());
  }
  
  getCampaign(campaignId: string): ThreatCampaign | undefined {
    return this.campaigns.get(campaignId);
  }
  
  getAllCampaigns(): ThreatCampaign[] {
    return Array.from(this.campaigns.values());
  }
  
  getAuditLog(limit: number = 100): BlockchainAuditEntry[] {
    return this.auditLog.slice(-limit);
  }
  
  getFeedStatus(): Record<string, { lastUpdate: number; indicatorsCount: number; status: "ok" | "error" | "stale" }> {
    const result: Record<string, any> = {};
    for (const [key, value] of this.feedStatus.entries()) {
      result[key] = value;
    }
    return result;
  }
  
  getStats(): ThreatIntelStats {
    const indicators = Array.from(this.indicators.values());
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let blockchainVerified = 0;
    
    for (const ind of indicators) {
      byType[ind.type] = (byType[ind.type] || 0) + 1;
      bySeverity[ind.severity] = (bySeverity[ind.severity] || 0) + 1;
      if (ind.blockchainVerified) blockchainVerified++;
    }
    
    return {
      totalIndicators: indicators.length,
      indicatorsByType: byType,
      indicatorsBySeverity: bySeverity,
      activeActors: Array.from(this.actors.values()).filter(a => Date.now() - a.lastActivity < 86400000).length,
      activeCampaigns: Array.from(this.campaigns.values()).filter(c => c.status === "active").length,
      blockchainVerified,
      lastUpdate: Math.max(...Array.from(this.feedStatus.values()).map(f => f.lastUpdate), 0),
      feedStatus: this.getFeedStatus()
    };
  }
  
  private cleanupOldIndicators() {
    const cutoff = Date.now() - this.config.maxThreatAge;
    let cleaned = 0;
    
    for (const [id, indicator] of this.indicators.entries()) {
      if (indicator.lastSeen < cutoff) {
        this.indicators.delete(id);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      log.info({ module: "ThreatIntelligenceSystem" }, "Cleaned up old threat indicators", { cleaned });
    }
  }
  
  private hashValue(value: string): string {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(value).digest("hex");
  }
  
  async shutdown() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.indicators.clear();
    this.actors.clear();
    this.campaigns.clear();
    this.auditLog.length = 0;
    this.feedStatus.clear();
    this.removeAllListeners();
    log.info({ module: "ThreatIntelligenceSystem" }, "ThreatIntelligenceSystem shutdown complete");
  }
}

export const threatIntelligenceSystem = ThreatIntelligenceSystem.getInstance();