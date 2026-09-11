/**
 * Threat Intelligence Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ThreatIntelManager,
  ThreatIntelCache,
  createThreatIntelManager,
  DEFAULT_THREAT_INTEL_CONFIG,
  DEFAULT_THREAT_INTEL_SOURCES,
  type ThreatCategory,
  type ThreatIndicator as ThreatIntelIndicator,
  type IPReputation as ThreatIntelIPReputation,
  type DomainReputation as ThreatIntelDomainReputation,
  type ThreatIntelConfig
} from '../src/security/ThreatIntelligence.js';
import type { IPAddress } from '../src/types/index.js';
import { 
  createDurationMs, 
  createUnixTimestampMs,
  createSecurityScore,
  createThreatLevel
} from '../src/types/branded.js';

describe('ThreatIntelCache', () => {
  let cache: ThreatIntelCache;

  beforeEach(() => {
    cache = new ThreatIntelCache(createDurationMs(1000)); // 1 second TTL for testing
  });

  afterEach(() => {
    cache.clear();
  });

  it('should store and retrieve IP reputation', () => {
    const ip = '192.168.1.1' as IPAddress;
    const reputation: ThreatIntelIPReputation = {
      ip,
      score: 50,
      categories: ['malware', 'botnet'] as ThreatCategory[],
      isTor: false,
      isVpn: false,
      isProxy: false,
      isHosting: false,
      country: 'US',
      asn: 12345,
      asnName: 'Test ASN',
      lastUpdated: createUnixTimestampMs(Date.now()),
      sources: ['TestSource']
    };

    cache.setIP(ip, reputation);
    const retrieved = cache.getIP(ip);
    
    expect(retrieved).toEqual(reputation);
  });

  it('should return null for non-existent IP', () => {
    const result = cache.getIP('10.0.0.1' as IPAddress);
    expect(result).toBeNull();
  });

  it('should expire entries after TTL', async () => {
    const ip = '192.168.1.1' as IPAddress;
    const reputation: ThreatIntelIPReputation = {
      ip,
      score: 50,
      categories: ['malware'] as ThreatCategory[],
      isTor: false,
      isVpn: false,
      isProxy: false,
      isHosting: false,
      country: 'US',
      asn: 12345,
      asnName: 'Test ASN',
      lastUpdated: createUnixTimestampMs(Date.now()),
      sources: ['TestSource']
    };

    cache.setIP(ip, reputation);
    expect(cache.getIP(ip)).toEqual(reputation);

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    expect(cache.getIP(ip)).toBeNull();
  });

  it('should store and retrieve domain reputation', () => {
    const domain = 'example.com';
    const reputation: ThreatIntelDomainReputation = {
      domain,
      score: 30,
      categories: ['phishing'] as ThreatCategory[],
      isPhishing: true,
      isMalware: false,
      age: createDurationMs(86400000),
      registrar: 'Test Registrar',
      lastUpdated: createUnixTimestampMs(Date.now()),
      sources: ['TestSource']
    };

    cache.setDomain(domain, reputation);
    const retrieved = cache.getDomain(domain);
    
    expect(retrieved).toEqual(reputation);
  });

  it('should store and retrieve indicators', () => {
    const key = 'ip:192.168.1.1';
    const indicators: ThreatIntelIndicator[] = [
      {
        indicator: '192.168.1.1',
        type: 'ip',
        categories: ['malware', 'botnet'],
        confidence: 0.9,
        severity: 'high',
        source: 'TestSource',
        firstSeen: createUnixTimestampMs(Date.now() - 86400000),
        lastSeen: createUnixTimestampMs(Date.now()),
        metadata: {}
      }
    ];

    cache.setIndicators(key, indicators);
    const retrieved = cache.getIndicators(key);
    
    expect(retrieved).toEqual(indicators);
  });

  it('should clear all caches', () => {
    cache.setIP('192.168.1.1' as IPAddress, {} as any);
    cache.setDomain('example.com', {} as any);
    cache.setIndicators('test', [] as any);

    cache.clear();

    expect(cache.getIP('192.168.1.1' as IPAddress)).toBeNull();
    expect(cache.getDomain('example.com')).toBeNull();
    expect(cache.getIndicators('test')).toBeNull();
  });

  it('should cleanup expired entries', async () => {
    const cache2 = new ThreatIntelCache(createDurationMs(100)); // Very short TTL
    
    cache2.setIP('192.168.1.1' as IPAddress, {} as any);
    cache2.setDomain('example.com', {} as any);
    
    expect(cache2.getStats().ipEntries).toBe(1);
    expect(cache2.getStats().domainEntries).toBe(1);

    await new Promise(resolve => setTimeout(resolve, 150));
    
    const cleaned = cache2.cleanup();
    expect(cleaned).toBe(2);
    expect(cache2.getStats().ipEntries).toBe(0);
    expect(cache2.getStats().domainEntries).toBe(0);
  });

  it('should return cache stats', () => {
    cache.setIP('192.168.1.1' as IPAddress, {} as any);
    cache.setIP('192.168.1.2' as IPAddress, {} as any);
    cache.setDomain('example.com', {} as any);
    cache.setIndicators('test', [] as any);

    const stats = cache.getStats();
    
    expect(stats.ipEntries).toBe(2);
    expect(stats.domainEntries).toBe(1);
    expect(stats.indicatorEntries).toBe(1);
  });
});

describe('ThreatIntelManager', () => {
  let manager: ThreatIntelManager;
  const testConfig: Partial<ThreatIntelConfig> = {
    enabled: true,
    sources: DEFAULT_THREAT_INTEL_SOURCES.slice(0, 2), // Use first 2 sources
    cacheEnabled: true,
    cacheTtl: createDurationMs(60000),
    minConfidence: 0.5,
    blockThreshold: 70,
    alertThreshold: 50,
    updateInterval: createDurationMs(3600000),
    timeout: createDurationMs(5000),
    retryAttempts: 1
  };

  beforeEach(() => {
    manager = createThreatIntelManager(testConfig);
  });

  afterEach(() => {
    manager.stop();
  });

  it('should create manager with config', () => {
    expect(manager).toBeInstanceOf(ThreatIntelManager);
  });

  it('should get stats', () => {
    const stats = manager.getStats();
    
    expect(stats).toHaveProperty('config');
    expect(stats).toHaveProperty('cache');
    expect(stats).toHaveProperty('lastUpdate');
    expect(stats).toHaveProperty('isUpdating');
    expect(stats.config.enabled).toBe(true);
  });

  it('should check IP reputation', async () => {
    const result = await manager.checkIP('192.168.1.100' as IPAddress);
    
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ip).toBe('192.168.1.100');
      expect(result.value.score).toBeGreaterThanOrEqual(0);
      expect(result.value.score).toBeLessThanOrEqual(100);
      expect(result.value.categories).toBeInstanceOf(Array);
      expect(result.value.sources).toBeInstanceOf(Array);
    }
  });

  it('should cache IP reputation', async () => {
    const ip = '192.168.1.100' as IPAddress;
    
    // First call
    const result1 = await manager.checkIP(ip);
    expect(result1.ok).toBe(true);
    
    // Second call should use cache
    const result2 = await manager.checkIP(ip);
    expect(result2.ok).toBe(true);
    
    // Results should be identical
    if (result1.ok && result2.ok) {
      expect(result1.value).toEqual(result2.value);
    }
  });

  it('should check domain reputation', async () => {
    const result = await manager.checkDomain('malicious-domain.com');
    
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.domain).toBe('malicious-domain.com');
      expect(result.value.score).toBeGreaterThanOrEqual(0);
      expect(result.value.categories).toBeInstanceOf(Array);
    }
  });

  it('should get indicators for IP', async () => {
    const indicators = await manager.getIndicatorsForIP('192.168.1.100' as IPAddress);
    
    expect(indicators).toBeInstanceOf(Array);
  });

  it('should determine if IP should be blocked', async () => {
    // High reputation IP from AbuseIPDB simulation
    const result = await manager.shouldBlockIP('192.168.1.100' as IPAddress);
    
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.value).toBe('boolean');
    }
  });

  it('should determine if IP should alert', async () => {
    const result = await manager.shouldAlertIP('192.168.1.100' as IPAddress);
    
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.value).toBe('boolean');
    }
  });

  it('should force update', async () => {
    await expect(manager.forceUpdate()).resolves.not.toThrow();
  });

  it('should start and stop', async () => {
    const mgr = createThreatIntelManager({ ...testConfig, enabled: true });
    
    await expect(mgr.start()).resolves.not.toThrow();
    expect(mgr.getStats().isUpdating).toBe(false);
    
    mgr.stop();
  });

  it('should emit events', async () => {
    const mgr = createThreatIntelManager({ ...testConfig, enabled: true });
    
    const startedPromise = new Promise(resolve => mgr.once('started', resolve));
    const updatedPromise = new Promise(resolve => mgr.once('updated', resolve));
    
    await mgr.start();
    await startedPromise;
    await mgr.forceUpdate();
    await updatedPromise;
    
    mgr.stop();
  });
});

describe('Default Configuration', () => {
  it('should have valid default config', () => {
    expect(DEFAULT_THREAT_INTEL_CONFIG.enabled).toBe(true);
    expect(DEFAULT_THREAT_INTEL_CONFIG.sources.length).toBeGreaterThan(0);
    expect(DEFAULT_THREAT_INTEL_CONFIG.cacheEnabled).toBe(true);
    expect(DEFAULT_THREAT_INTEL_CONFIG.minConfidence).toBeGreaterThan(0);
    expect(DEFAULT_THREAT_INTEL_CONFIG.minConfidence).toBeLessThanOrEqual(1);
    expect(DEFAULT_THREAT_INTEL_CONFIG.blockThreshold).toBeGreaterThan(0);
    expect(DEFAULT_THREAT_INTEL_CONFIG.alertThreshold).toBeLessThan(DEFAULT_THREAT_INTEL_CONFIG.blockThreshold);
  });

  it('should have valid default sources', () => {
    for (const source of DEFAULT_THREAT_INTEL_SOURCES) {
      expect(source.name).toBeTruthy();
      expect(source.url).toBeTruthy();
      expect(source.weight).toBeGreaterThan(0);
      expect(source.weight).toBeLessThanOrEqual(1);
      expect(source.categories.length).toBeGreaterThan(0);
      expect(source.updateInterval).toBeGreaterThan(0);
    }
  });

  it('should have unique source names', () => {
    const names = DEFAULT_THREAT_INTEL_SOURCES.map(s => s.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });
});

describe('Threat Indicator Types', () => {
  it('should accept all threat categories', () => {
    const categories: ThreatCategory[] = [
      'malware', 'phishing', 'botnet', 'tor', 'vpn', 'proxy',
      'scanner', 'spam', 'c2', 'exploit', 'ransomware', 'crypto_miner'
    ];

    expect(categories).toHaveLength(12);
  });

  it('should create valid threat indicator', () => {
    const indicator: ThreatIntelIndicator = {
      indicator: '192.168.1.1',
      type: 'ip',
      categories: ['malware', 'botnet'],
      confidence: 0.9,
      severity: 'high',
      source: 'TestSource',
      firstSeen: createUnixTimestampMs(Date.now() - 86400000),
      lastSeen: createUnixTimestampMs(Date.now()),
      metadata: { test: 'value' }
    };

    expect(indicator.confidence).toBeGreaterThan(0);
    expect(indicator.confidence).toBeLessThanOrEqual(1);
    expect(['low', 'medium', 'high', 'critical']).toContain(indicator.severity);
  });
});