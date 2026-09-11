/**
 * Threat Intelligence Feeds Integration
 * 
 * Integrates with multiple threat intelligence sources for real-time
 * malicious IP, domain, and URL reputation checking.
 */

import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import type { 
  Result, 
  AsyncResult,
  IPAddress,
  UnixTimestampMs,
  DurationMs,
  ThreatCategory
} from '../types/index.js';
import { 
  ok, 
  err, 
  isOk,
  createDurationMs,
  createUnixTimestampMs,
  createUnixTimestamp
} from '../types/branded.js';

// ============================================================================
// Threat Intelligence Types
// ============================================================================

export interface ThreatIntelSource {
  readonly name: string;
  readonly url: string;
  readonly apiKey?: string;
  readonly updateInterval: DurationMs;
  readonly weight: number; // 0-1, higher = more trusted
  readonly categories: ThreatCategory[];
}

export type ThreatCategory = 
  | 'malware'
  | 'phishing'
  | 'botnet'
  | 'tor'
  | 'vpn'
  | 'proxy'
  | 'scanner'
  | 'spam'
  | 'c2'
  | 'exploit'
  | 'ransomware'
  | 'crypto_miner';

export interface ThreatIndicator {
  readonly indicator: string; // IP, domain, URL, hash
  readonly type: 'ip' | 'domain' | 'url' | 'hash';
  readonly categories: ThreatCategory[];
  readonly confidence: number; // 0-1
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly source: string;
  readonly firstSeen: UnixTimestampMs;
  readonly lastSeen: UnixTimestampMs;
  readonly metadata: Record<string, unknown>;
}

export interface IPReputation {
  readonly ip: IPAddress;
  readonly score: number; // 0-100, higher = more malicious
  readonly categories: ThreatCategory[];
  readonly isTor: boolean;
  readonly isVpn: boolean;
  readonly isProxy: boolean;
  readonly isHosting: boolean;
  readonly country: string;
  readonly asn: number;
  readonly asnName: string;
  readonly lastUpdated: number; // UnixTimestampMs
  readonly sources: string[];
}

export interface DomainReputation {
  readonly domain: string;
  readonly score: number;
  readonly categories: ThreatCategory[];
  readonly isPhishing: boolean;
  readonly isMalware: boolean;
  readonly age: number; // DurationMs
  readonly registrar: string;
  readonly lastUpdated: number; // UnixTimestampMs
  readonly sources: string[];
}

export interface ThreatIntelConfig {
  readonly enabled: boolean;
  readonly sources: ThreatIntelSource[];
  readonly cacheEnabled: boolean;
  readonly cacheTtl: number; // DurationMs
  readonly minConfidence: number;
  readonly blockThreshold: number; // score threshold for blocking
  readonly alertThreshold: number; // score threshold for alerting
  readonly updateInterval: number; // DurationMs
  readonly timeout: number; // DurationMs
  readonly retryAttempts: number;
}

export interface ThreatIndicator {
  readonly indicator: string; // IP, domain, URL, hash
  readonly type: 'ip' | 'domain' | 'url' | 'hash';
  readonly categories: ThreatCategory[];
  readonly confidence: number; // 0-1
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly source: string;
  readonly firstSeen: UnixTimestampMs;
  readonly lastSeen: UnixTimestampMs;
  readonly metadata: Record<string, unknown>;
}

export interface IPReputation {
  readonly ip: IPAddress;
  readonly score: number; // 0-100, higher = more malicious
  readonly categories: ThreatCategory[];
  readonly isTor: boolean;
  readonly isVpn: boolean;
  readonly isProxy: boolean;
  readonly isHosting: boolean;
  readonly country: string;
  readonly asn: number;
  readonly asnName: string;
  readonly lastUpdated: UnixTimestampMs;
  readonly sources: string[];
}

export interface DomainReputation {
  readonly domain: string;
  readonly score: number;
  readonly categories: ThreatCategory[];
  readonly isPhishing: boolean;
  readonly isMalware: boolean;
  readonly age: DurationMs;
  readonly registrar: string;
  readonly lastUpdated: UnixTimestampMs;
  readonly sources: string[];
}

export interface ThreatIntelConfig {
  readonly enabled: boolean;
  readonly sources: ThreatIntelSource[];
  readonly cacheEnabled: boolean;
  readonly cacheTtl: DurationMs;
  readonly minConfidence: number;
  readonly blockThreshold: number; // score threshold for blocking
  readonly alertThreshold: number; // score threshold for alerting
  readonly updateInterval: DurationMs;
  readonly timeout: DurationMs;
  readonly retryAttempts: number;
}

// ============================================================================
// Default Threat Intelligence Sources
// ============================================================================

export const DEFAULT_THREAT_INTEL_SOURCES: ThreatIntelSource[] = [
  {
    name: 'AbuseIPDB',
    url: 'https://api.abuseipdb.com/api/v2',
    updateInterval: createDurationMs(3600000), // 1 hour
    weight: 0.9,
    categories: ['malware', 'botnet', 'scanner', 'spam', 'exploit']
  },
  {
    name: 'AlienVault OTX',
    url: 'https://otx.alienvault.com/api/v1',
    updateInterval: createDurationMs(3600000),
    weight: 0.85,
    categories: ['malware', 'phishing', 'botnet', 'c2', 'ransomware', 'crypto_miner']
  },
  {
    name: 'Spamhaus',
    url: 'https://www.spamhaus.org',
    updateInterval: createDurationMs(7200000), // 2 hours
    weight: 0.95,
    categories: ['spam', 'botnet', 'malware']
  },
  {
    name: 'Tor Project',
    url: 'https://check.torproject.org',
    updateInterval: createDurationMs(86400000), // 24 hours
    weight: 1.0,
    categories: ['tor']
  },
  {
    name: 'FireHOL',
    url: 'https://raw.githubusercontent.com/firehol/blocklist-ipsets/master',
    updateInterval: createDurationMs(86400000),
    weight: 0.8,
    categories: ['malware', 'botnet', 'scanner', 'spam', 'exploit', 'crypto_miner']
  },
  {
    name: 'Emerging Threats',
    url: 'https://rules.emergingthreats.net/blockrules',
    updateInterval: createDurationMs(86400000),
    weight: 0.85,
    categories: ['malware', 'botnet', 'c2', 'exploit', 'ransomware']
  },
  {
    name: 'URLhaus',
    url: 'https://urlhaus-api.abuse.ch/v1',
    updateInterval: createDurationMs(3600000),
    weight: 0.9,
    categories: ['malware', 'phishing', 'c2']
  }
];

export const DEFAULT_THREAT_INTEL_CONFIG: ThreatIntelConfig = {
  enabled: true,
  sources: DEFAULT_THREAT_INTEL_SOURCES,
  cacheEnabled: true,
  cacheTtl: createDurationMs(3600000), // 1 hour
  minConfidence: 0.7,
  blockThreshold: 70,
  alertThreshold: 50,
  updateInterval: createDurationMs(3600000), // 1 hour
  timeout: createDurationMs(10000),
  retryAttempts: 3
};

// ============================================================================
// Threat Intelligence Cache
// ============================================================================

interface CacheEntry<T> {
  data: T;
  expiresAt: UnixTimestampMs;
}

export class ThreatIntelCache {
  private ipCache = new Map<string, CacheEntry<IPReputation>>();
  private domainCache = new Map<string, CacheEntry<DomainReputation>>();
  private indicatorCache = new Map<string, CacheEntry<ThreatIndicator[]>>();
  private readonly ttl: DurationMs;

  constructor(ttl: DurationMs = createDurationMs(3600000)) {
    this.ttl = ttl;
  }

  getIP(ip: IPAddress): IPReputation | null {
    const entry = this.ipCache.get(ip);
    if (!entry) return null;
    if (createUnixTimestampMs(Date.now()) > entry.expiresAt) {
      this.ipCache.delete(ip);
      return null;
    }
    return entry.data;
  }

  setIP(ip: IPAddress, data: IPReputation): void {
    this.ipCache.set(ip, {
      data,
      expiresAt: createUnixTimestampMs(Date.now() + this.ttl)
    });
  }

  getDomain(domain: string): DomainReputation | null {
    const entry = this.domainCache.get(domain);
    if (!entry) return null;
    if (createUnixTimestampMs(Date.now()) > entry.expiresAt) {
      this.domainCache.delete(domain);
      return null;
    }
    return entry.data;
  }

  setDomain(domain: string, data: DomainReputation): void {
    this.domainCache.set(domain, {
      data,
      expiresAt: createUnixTimestampMs(Date.now() + this.ttl)
    });
  }

  getIndicators(key: string): ThreatIndicator[] | null {
    const entry = this.indicatorCache.get(key);
    if (!entry) return null;
    if (createUnixTimestampMs(Date.now()) > entry.expiresAt) {
      this.indicatorCache.delete(key);
      return null;
    }
    return entry.data;
  }

  setIndicators(key: string, data: ThreatIndicator[]): void {
    this.indicatorCache.set(key, {
      data,
      expiresAt: createUnixTimestampMs(Date.now() + this.ttl)
    });
  }

  clear(): void {
    this.ipCache.clear();
    this.domainCache.clear();
    this.indicatorCache.clear();
  }

  cleanup(): number {
    const now = createUnixTimestampMs(Date.now());
    let cleaned = 0;
    
    for (const [key, entry] of this.ipCache) {
      if (now > entry.expiresAt) {
        this.ipCache.delete(key);
        cleaned++;
      }
    }
    for (const [key, entry] of this.domainCache) {
      if (now > entry.expiresAt) {
        this.domainCache.delete(key);
        cleaned++;
      }
    }
    for (const [key, entry] of this.indicatorCache) {
      if (now > entry.expiresAt) {
        this.indicatorCache.delete(key);
        cleaned++;
      }
    }
    
    return cleaned;
  }

  getStats(): { ipEntries: number; domainEntries: number; indicatorEntries: number } {
    return {
      ipEntries: this.ipCache.size,
      domainEntries: this.domainCache.size,
      indicatorEntries: this.indicatorCache.size
    };
  }
}

// ============================================================================
// Threat Intelligence Manager
// ============================================================================

export class ThreatIntelManager extends EventEmitter {
  private config: ThreatIntelConfig;
  private cache: ThreatIntelCache;
  private updateTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private isUpdating = false;
  private lastUpdate: UnixTimestampMs = createUnixTimestampMs(0);
  private indicators: Map<string, ThreatIndicator[]> = new Map();

  constructor(config: Partial<ThreatIntelConfig> = {}) {
    super();
    this.config = { ...DEFAULT_THREAT_INTEL_CONFIG, ...config };
    this.cache = new ThreatIntelCache(this.config.cacheTtl);
  }

  /**
   * Start the threat intelligence manager
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      console.log('[ThreatIntel] Disabled by configuration');
      return;
    }

    console.log('[ThreatIntel] Starting threat intelligence feeds...');
    
    // Initial update
    await this.updateAllSources();
    
    // Schedule periodic updates
    this.updateTimer = setInterval(
      () => this.updateAllSources(),
      this.config.updateInterval
    );

    // Schedule cache cleanup
    this.cleanupTimer = setInterval(
      () => this.cache.cleanup(),
      createDurationMs(300000) // 5 minutes
    );

    console.log('[ThreatIntel] Started with', this.config.sources.length, 'sources');
    this.emit('started');
  }

  /**
   * Stop the threat intelligence manager
   */
  stop(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    console.log('[ThreatIntel] Stopped');
    this.emit('stopped');
  }

  /**
   * Check IP reputation
   */
  async checkIP(ip: IPAddress): Promise<Result<IPReputation, Error>> {
    // Check cache first
    const cached = this.cache.getIP(ip);
    if (cached) {
      return ok(cached);
    }

    // Query sources
    try {
      const reputation = await this.queryIPReputation(ip);
      if (this.config.cacheEnabled) {
        this.cache.setIP(ip, reputation);
      }
      return ok(reputation);
    } catch (error) {
      return err(error as Error);
    }
  }

  /**
   * Check domain reputation
   */
  async checkDomain(domain: string): Promise<Result<DomainReputation, Error>> {
    // Check cache first
    const cached = this.cache.getDomain(domain);
    if (cached) {
      return ok(cached);
    }

    try {
      const reputation = await this.queryDomainReputation(domain);
      if (this.config.cacheEnabled) {
        this.cache.setDomain(domain, reputation);
      }
      return ok(reputation);
    } catch (error) {
      return err(error as Error);
    }
  }

  /**
   * Get all indicators for an IP
   */
  async getIndicatorsForIP(ip: IPAddress): Promise<ThreatIndicator[]> {
    const cacheKey = `ip:${ip}`;
    const cached = this.cache.getIndicators(cacheKey);
    if (cached) return cached;

    const indicators: ThreatIndicator[] = [];
    
    for (const source of this.config.sources) {
      try {
        const sourceIndicators = await this.querySourceForIP(source, ip);
        indicators.push(...sourceIndicators);
      } catch (error) {
        console.warn(`[ThreatIntel] Source ${source.name} failed for IP ${ip}:`, error);
      }
    }

    // Deduplicate and sort by confidence
    const unique = this.deduplicateIndicators(indicators);
    this.cache.setIndicators(cacheKey, unique);
    
    return unique;
  }

  /**
   * Check if IP should be blocked
   */
  async shouldBlockIP(ip: IPAddress): Promise<Result<boolean, Error>> {
    const repResult = await this.checkIP(ip);
    if (!repResult.ok) return repResult;

    const shouldBlock = repResult.value.score >= this.config.blockThreshold;
    return ok(shouldBlock);
  }

  /**
   * Check if IP should trigger alert
   */
  async shouldAlertIP(ip: IPAddress): Promise<Result<boolean, Error>> {
    const repResult = await this.checkIP(ip);
    if (!repResult.ok) return repResult;

    const shouldAlert = repResult.value.score >= this.config.alertThreshold;
    return ok(shouldAlert);
  }

  /**
   * Get current statistics
   */
  getStats(): {
    config: ThreatIntelConfig;
    cache: ReturnType<ThreatIntelCache['getStats']>;
    lastUpdate: UnixTimestampMs;
    isUpdating: boolean;
  } {
    return {
      config: this.config,
      cache: this.cache.getStats(),
      lastUpdate: this.lastUpdate,
      isUpdating: this.isUpdating
    };
  }

  /**
   * Force update all sources
   */
  async forceUpdate(): Promise<void> {
    await this.updateAllSources();
  }

  // Private methods

  private async updateAllSources(): Promise<void> {
    if (this.isUpdating) return;
    this.isUpdating = true;

    console.log('[ThreatIntel] Updating threat intelligence feeds...');
    const startTime = Date.now();

    const updatePromises = this.config.sources.map(source => 
      this.updateSource(source).catch(error => {
        console.error(`[ThreatIntel] Failed to update ${source.name}:`, error);
        return [];
      })
    );

    const results = await Promise.allSettled(updatePromises);
    
    let totalIndicators = 0;
    for (const result of results) {
      if (result.status === 'fulfilled') {
        totalIndicators += result.value.length;
        for (const indicator of result.value) {
          const key = `${indicator.type}:${indicator.indicator}`;
          const existing = this.indicators.get(key) || [];
          existing.push(indicator);
          this.indicators.set(key, existing);
        }
      }
    }

    this.lastUpdate = createUnixTimestampMs(Date.now());
    this.isUpdating = false;

    console.log(`[ThreatIntel] Updated ${totalIndicators} indicators in ${Date.now() - startTime}ms`);
    this.emit('updated', { indicatorCount: totalIndicators });
  }

  private async updateSource(source: ThreatIntelSource): Promise<ThreatIndicator[]> {
    console.log(`[ThreatIntel] Updating ${source.name}...`);
    
    // In production, this would fetch from actual APIs
    // For now, return simulated data
    return this.fetchFromSource(source);
  }

  private async fetchFromSource(source: ThreatIntelSource): Promise<ThreatIndicator[]> {
    // Simulate fetching from various sources
    // In production, implement actual API calls for each source
    
    const indicators: ThreatIndicator[] = [];
    const now = createUnixTimestampMs(Date.now());
    const day = 86400000;

    // Simulate some indicators for testing
    if (source.name === 'AbuseIPDB') {
      indicators.push(
        this.createIndicator('192.168.1.100', 'ip', ['malware', 'botnet'], 0.9, 'high', source.name),
        this.createIndicator('10.0.0.50', 'ip', ['scanner', 'exploit'], 0.8, 'medium', source.name)
      );
    } else if (source.name === 'AlienVault OTX') {
      indicators.push(
        this.createIndicator('malicious-domain.com', 'domain', ['phishing', 'c2'], 0.95, 'critical', source.name),
        this.createIndicator('evil-site.net', 'domain', ['malware', 'ransomware'], 0.85, 'high', source.name)
      );
    } else if (source.name === 'Tor Project') {
      indicators.push(
        this.createIndicator('185.220.101.1', 'ip', ['tor'], 1.0, 'high', source.name),
        this.createIndicator('185.220.101.2', 'ip', ['tor'], 1.0, 'high', source.name)
      );
    } else if (source.name === 'FireHOL') {
      indicators.push(
        this.createIndicator('45.77.100.200', 'ip', ['botnet', 'crypto_miner'], 0.8, 'high', source.name),
        this.createIndicator('103.100.50.25', 'ip', ['malware', 'scanner'], 0.75, 'medium', source.name)
      );
    }

    return indicators;
  }

  private createIndicator(
    indicator: string,
    type: ThreatIndicator['type'],
    categories: ThreatCategory[],
    confidence: number,
    severity: ThreatIndicator['severity'],
    source: string
  ): ThreatIndicator {
    const now = createUnixTimestampMs(Date.now());
    return {
      indicator,
      type,
      categories,
      confidence,
      severity,
      source,
      firstSeen: createUnixTimestampMs(now - 86400000),
      lastSeen: now,
      metadata: {}
    };
  }

  private async queryIPReputation(ip: IPAddress): Promise<IPReputation> {
    // Aggregate from all sources
    let totalScore = 0;
    let totalWeight = 0;
    const categories = new Set<ThreatCategory>();
    const sources: string[] = [];
    let isTor = false;
    let isVpn = false;
    let isProxy = false;
    let isHosting = false;

    for (const source of this.config.sources) {
      try {
        const indicators = await this.querySourceForIP(source, ip);
        
        for (const indicator of indicators) {
          if (indicator.confidence < this.config.minConfidence) continue;
          
          totalScore += indicator.confidence * 100 * source.weight;
          totalWeight += source.weight;
          
          for (const cat of indicator.categories) {
            categories.add(cat);
          }
          
          if (!sources.includes(source.name)) {
            sources.push(source.name);
          }

          if (indicator.categories.includes('tor')) isTor = true;
          if (indicator.categories.includes('vpn')) isVpn = true;
          if (indicator.categories.includes('proxy')) isProxy = true;
        }
      } catch (error) {
        console.warn(`[ThreatIntel] Error querying ${source.name} for ${ip}:`, error);
      }
    }

    const finalScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;

    return {
      ip,
      score: Math.min(100, finalScore),
      categories: Array.from(categories),
      isTor,
      isVpn,
      isProxy,
      isHosting,
      country: 'US', // Would be determined from GeoIP
      asn: 0,
      asnName: 'Unknown',
      lastUpdated: createUnixTimestampMs(Date.now()),
      sources
    };
  }

  private async queryDomainReputation(domain: string): Promise<DomainReputation> {
    let totalScore = 0;
    let totalWeight = 0;
    const categories = new Set<ThreatCategory>();
    const sources: string[] = [];
    let isPhishing = false;
    let isMalware = false;

    for (const source of this.config.sources) {
      try {
        const indicators = await this.querySourceForDomain(source, domain);
        
        for (const indicator of indicators) {
          if (indicator.confidence < this.config.minConfidence) continue;
          
          totalScore += indicator.confidence * 100 * source.weight;
          totalWeight += source.weight;
          
          for (const cat of indicator.categories) {
            categories.add(cat);
          }
          
          if (!sources.includes(source.name)) {
            sources.push(source.name);
          }

          if (indicator.categories.includes('phishing')) isPhishing = true;
          if (indicator.categories.includes('malware')) isMalware = true;
        }
      } catch (error) {
        console.warn(`[ThreatIntel] Error querying ${source.name} for ${domain}:`, error);
      }
    }

    const finalScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;

    return {
      domain,
      score: Math.min(100, finalScore),
      categories: Array.from(categories),
      isPhishing,
      isMalware,
      age: createDurationMs(0),
      registrar: 'Unknown',
      lastUpdated: createUnixTimestampMs(Date.now()),
      sources
    };
  }

  private async querySourceForIP(source: ThreatIntelSource, ip: IPAddress): Promise<ThreatIndicator[]> {
    // In production, implement actual API calls
    // This is a simulation for testing
    return this.fetchFromSource(source).then(indicators => 
      indicators.filter(i => i.type === 'ip' && i.indicator === ip)
    );
  }

  private async querySourceForDomain(source: ThreatIntelSource, domain: string): Promise<ThreatIndicator[]> {
    return this.fetchFromSource(source).then(indicators => 
      indicators.filter(i => i.type === 'domain' && i.indicator === domain)
    );
  }

  private deduplicateIndicators(indicators: ThreatIndicator[]): ThreatIndicator[] {
    const map = new Map<string, ThreatIndicator>();
    
    for (const indicator of indicators) {
      const key = `${indicator.type}:${indicator.indicator}:${indicator.source}`;
      const existing = map.get(key);
      
      if (!existing || indicator.confidence > existing.confidence) {
        map.set(key, indicator);
      }
    }
    
    return Array.from(map.values()).sort((a, b) => b.confidence - a.confidence);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let threatIntelManager: ThreatIntelManager | null = null;

export function createThreatIntelManager(config?: Partial<ThreatIntelConfig>): ThreatIntelManager {
  if (threatIntelManager) {
    threatIntelManager.stop();
  }
  threatIntelManager = new ThreatIntelManager(config);
  return threatIntelManager;
}

export function getThreatIntelManager(): ThreatIntelManager | null {
  return threatIntelManager;
}

export async function initializeThreatIntel(config?: Partial<ThreatIntelConfig>): Promise<ThreatIntelManager> {
  const manager = createThreatIntelManager(config);
  await manager.start();
  return manager;
}