import { EventEmitter } from "events";
import { log, createModuleLogger } from "../logging/logger.js";

const logger = createModuleLogger("EdgeCacheSystem");

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number;
  tags: string[];
  staleWhileRevalidate: number;
  compressed: boolean;
  size: number;
}

export interface CacheConfig {
  maxMemoryMB: number;
  defaultTTL: number;
  staleWhileRevalidate: number;
  compressionThreshold: number;
  enableCompression: boolean;
  evictionPolicy: "lru" | "lfu" | "fifo" | "ttl";
}

export interface EdgeLocation {
  id: string;
  region: string;
  latency: number;
  healthy: boolean;
  lastCheck: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalSize: number;
  entryCount: number;
  evictions: number;
  compressionRatio: number;
  avgLatencyMs: number;
}

interface CacheEvents {
  revalidate: [{ key: string; entry: CacheEntry }];
}

export class EdgeCacheSystem extends EventEmitter {
  private static instance: EdgeCacheSystem;
  
  private cache = new Map<string, CacheEntry>();
  private tagIndex = new Map<string, Set<string>>();
  private accessFrequency = new Map<string, number>();
  private accessRecency = new Map<string, number>();
  
  private config: CacheConfig = {
    maxMemoryMB: 512,
    defaultTTL: 300000,
    staleWhileRevalidate: 60000,
    compressionThreshold: 1024,
    enableCompression: true,
    evictionPolicy: "lru"
  };
  
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    totalSize: 0,
    entryCount: 0,
    evictions: 0,
    compressionRatio: 1,
    avgLatencyMs: 0
  };
  
  private edgeLocations: EdgeLocation[] = [
    { id: "iad", region: "us-east", latency: 0, healthy: true, lastCheck: 0 },
    { id: "lax", region: "us-west", latency: 0, healthy: true, lastCheck: 0 },
    { id: "lhr", region: "eu-west", latency: 0, healthy: true, lastCheck: 0 },
    { id: "hkg", region: "ap-east", latency: 0, healthy: true, lastCheck: 0 },
    { id: "sin", region: "ap-southeast", latency: 0, healthy: true, lastCheck: 0 },
    { id: "syd", region: "au-east", latency: 0, healthy: true, lastCheck: 0 },
    { id: "fra", region: "eu-central", latency: 0, healthy: true, lastCheck: 0 },
    { id: "nrt", region: "ap-northeast", latency: 0, healthy: true, lastCheck: 0 }
  ];
  
  private currentEdgeIndex = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private statsInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private revalidationQueue = new Set<string>();
  private revalidationInterval: NodeJS.Timeout | null = null;
  
  private constructor() {
    super();
    this.startBackgroundTasks();
  }
  
  static getInstance(): EdgeCacheSystem {
    if (!EdgeCacheSystem.instance) {
      EdgeCacheSystem.instance = new EdgeCacheSystem();
    }
    return EdgeCacheSystem.instance;
  }
  
  configure(config: Partial<CacheConfig>) {
    this.config = { ...this.config, ...config };
    log.info({ module: "EdgeCacheSystem" }, "EdgeCacheSystem configured", { config: this.config });
  }
  
  private startBackgroundTasks() {
    this.healthCheckInterval = setInterval(() => this.checkEdgeHealth(), 30000);
    this.statsInterval = setInterval(() => this.updateStats(), 5000);
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    this.revalidationInterval = setInterval(() => this.processRevalidationQueue(), 1000);
  }
  
  private async checkEdgeHealth() {
    for (const location of this.edgeLocations) {
      const start = Date.now();
      try {
        await fetch(`https://${location.id}.example.com/health`, { 
          method: "HEAD", 
          signal: AbortSignal.timeout(2000) 
        });
        location.healthy = true;
        location.latency = Date.now() - start;
      } catch {
        location.healthy = false;
        location.latency = 9999;
      }
      location.lastCheck = Date.now();
    }
    
    this.edgeLocations.sort((a, b) => a.latency - b.latency);
    log.debug({ module: "EdgeCacheSystem" }, "Edge health check complete", { 
      healthy: this.edgeLocations.filter(l => l.healthy).length,
      total: this.edgeLocations.length 
    });
  }
  
  private updateStats() {
    this.stats.hitRate = this.stats.hits / Math.max(1, this.stats.hits + this.stats.misses);
    this.stats.entryCount = this.cache.size;
    this.stats.totalSize = Array.from(this.cache.values()).reduce((sum, e) => sum + e.size, 0);
    
    const latencies = Array.from(this.cache.values()).map(e => e.timestamp);
    this.stats.avgLatencyMs = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  }
  
  private cleanup() {
    const now = Date.now();
    let evicted = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl + entry.staleWhileRevalidate) {
        this.deleteEntry(key);
        evicted++;
      }
    }
    
    if (this.stats.totalSize > this.config.maxMemoryMB * 1024 * 1024) {
      const toEvict = this.selectEvictionCandidates();
      for (const key of toEvict) {
        this.deleteEntry(key);
        evicted++;
      }
    }
    
    this.stats.evictions += evicted;
    
    if (evicted > 0) {
      log.debug({ module: "EdgeCacheSystem" }, "Cache cleanup complete", { evicted, remaining: this.cache.size });
    }
  }
  
  private selectEvictionCandidates(): string[] {
    const entries = Array.from(this.cache.entries());
    const targetCount = Math.ceil(entries.length * 0.1);
    
    switch (this.config.evictionPolicy) {
      case "lru":
        entries.sort((a, b) => (this.accessRecency.get(a[0]) || 0) - (this.accessRecency.get(b[0]) || 0));
        break;
      case "lfu":
        entries.sort((a, b) => (this.accessFrequency.get(a[0]) || 0) - (this.accessFrequency.get(b[0]) || 0));
        break;
      case "fifo":
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        break;
      case "ttl":
        entries.sort((a, b) => (a[1].timestamp + a[1].ttl) - (b[1].timestamp + b[1].ttl));
        break;
    }
    
    return entries.slice(0, targetCount).map(e => e[0]);
  }
  
  private deleteEntry(key: string) {
    const entry = this.cache.get(key);
    if (!entry) return;
    
    for (const tag of entry.tags) {
      const taggedKeys = this.tagIndex.get(tag);
      if (taggedKeys) {
        taggedKeys.delete(key);
        if (taggedKeys.size === 0) {
          this.tagIndex.delete(tag);
        }
      }
    }
    
    this.cache.delete(key);
    this.accessFrequency.delete(key);
    this.accessRecency.delete(key);
  }
  
  private async processRevalidationQueue() {
    if (this.revalidationQueue.size === 0) return;
    
    const keys = Array.from(this.revalidationQueue).slice(0, 10);
    for (const key of keys) {
      this.revalidationQueue.delete(key);
      const entry = this.cache.get(key);
      if (entry && entry.staleWhileRevalidate > 0) {
        this.emit("revalidate", { key, entry });
      }
    }
  }
  
  private compress(data: any): { compressed: boolean; data: any; size: number } {
    const json = JSON.stringify(data);
    const size = Buffer.byteLength(json, "utf8");
    
    if (!this.config.enableCompression || size < this.config.compressionThreshold) {
      return { compressed: false, data: json, size };
    }
    
    try {
      const compressed = Buffer.from(json).toString("base64");
      const compressedSize = Buffer.byteLength(compressed, "utf8");
      
      if (compressedSize < size * 0.9) {
        this.stats.compressionRatio = (this.stats.compressionRatio * 0.9) + (size / compressedSize) * 0.1;
        return { compressed: true, data: compressed, size: compressedSize };
      }
    } catch (err) {
      log.warn({ module: "EdgeCacheSystem" }, "Compression failed", { error: err });
    }
    
    return { compressed: false, data: json, size };
  }
  
  private decompress(entry: CacheEntry): any {
    if (!entry.compressed) return entry.value;
    try {
      return JSON.parse(Buffer.from(entry.value as string, "base64").toString("utf8"));
    } catch {
      return entry.value;
    }
  }
  
  async get<T>(key: string): Promise<T | null> {
    const start = performance.now();
    const entry = this.cache.get(key);
    const latency = performance.now() - start;
    
    this.stats.avgLatencyMs = this.stats.avgLatencyMs * 0.9 + latency * 0.1;
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    const now = Date.now();
    const age = now - entry.timestamp;
    
    if (age > entry.ttl + entry.staleWhileRevalidate) {
      this.deleteEntry(key);
      this.stats.misses++;
      return null;
    }
    
    this.accessFrequency.set(key, (this.accessFrequency.get(key) || 0) + 1);
    this.accessRecency.set(key, now);
    
    if (age > entry.ttl) {
      this.revalidationQueue.add(key);
    }
    
    this.stats.hits++;
    return this.decompress(entry) as T;
  }
  
  async set<T>(key: string, value: T, options: {
    ttl?: number;
    tags?: string[];
    staleWhileRevalidate?: number;
  } = {}): Promise<void> {
    const { compressed, data, size } = this.compress(value);
    
    const entry: CacheEntry<T> = {
      key,
      value: data,
      timestamp: Date.now(),
      ttl: options.ttl || this.config.defaultTTL,
      tags: options.tags || [],
      staleWhileRevalidate: options.staleWhileRevalidate ?? this.config.staleWhileRevalidate,
      compressed,
      size
    };
    
    if (this.stats.totalSize + size > this.config.maxMemoryMB * 1024 * 1024) {
      const toEvict = this.selectEvictionCandidates();
      for (const evictKey of toEvict) {
        this.deleteEntry(evictKey);
        this.stats.evictions++;
      }
    }
    
    this.cache.set(key, entry);
    
    for (const tag of entry.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(key);
    }
    
    this.accessFrequency.set(key, 1);
    this.accessRecency.set(key, Date.now());
  }
  
  async delete(key: string): Promise<boolean> {
    const existed = this.cache.has(key);
    if (existed) {
      this.deleteEntry(key);
    }
    return existed;
  }
  
  async invalidateByTag(tag: string): Promise<number> {
    const keys = this.tagIndex.get(tag);
    if (!keys) return 0;
    
    let count = 0;
    for (const key of keys) {
      this.deleteEntry(key);
      count++;
    }
    
    this.tagIndex.delete(tag);
    return count;
  }
  
  async invalidateByPattern(pattern: string): Promise<number> {
    const regex = new RegExp(pattern.replace(/\*/g, ".*"));
    let count = 0;
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.deleteEntry(key);
        count++;
      }
    }
    
    return count;
  }
  
  async clear(): Promise<void> {
    this.cache.clear();
    this.tagIndex.clear();
    this.accessFrequency.clear();
    this.accessRecency.clear();
    this.revalidationQueue.clear();
    log.info({ module: "EdgeCacheSystem" }, "Cache cleared");
  }
  
  getEdgeLocation(clientRegion?: string): EdgeLocation {
    if (clientRegion) {
      const regional = this.edgeLocations.find(l => l.region.includes(clientRegion) && l.healthy);
      if (regional) return regional;
    }
    
    for (let i = 0; i < this.edgeLocations.length; i++) {
      const idx = (this.currentEdgeIndex + i) % this.edgeLocations.length;
      if (this.edgeLocations[idx].healthy) {
        this.currentEdgeIndex = (idx + 1) % this.edgeLocations.length;
        return this.edgeLocations[idx];
      }
    }
    
    return this.edgeLocations[0];
  }
  
  async getOrSet<T>(key: string, fetcher: () => Promise<T>, options: {
    ttl?: number;
    tags?: string[];
  } = {}): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    
    const value = await fetcher();
    await this.set(key, value, options);
    return value;
  }
  
  getStats(): CacheStats {
    return { ...this.stats };
  }
  
  getEdgeLocations(): EdgeLocation[] {
    return [...this.edgeLocations];
  }
  
  async warmup(keys: Array<{ key: string; fetcher: () => Promise<any>; options?: any }>): Promise<void> {
    log.info({ module: "EdgeCacheSystem" }, "Starting cache warmup", { count: keys.length });
    
    await Promise.all(keys.map(async ({ key, fetcher, options }) => {
      try {
        const value = await fetcher();
        await this.set(key, value, options);
      } catch (err) {
        log.warn({ module: "EdgeCacheSystem" }, "Warmup failed for key", { key, error: err });
      }
    }));
    
    log.info({ module: "EdgeCacheSystem" }, "Cache warmup complete");
  }
  
  async shutdown() {
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    if (this.statsInterval) clearInterval(this.statsInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    if (this.revalidationInterval) clearInterval(this.revalidationInterval);
    
    this.cache.clear();
    this.tagIndex.clear();
    this.accessFrequency.clear();
    this.accessRecency.clear();
    this.revalidationQueue.clear();
    this.removeAllListeners();
    
    log.info({ module: "EdgeCacheSystem" }, "EdgeCacheSystem shutdown complete");
  }
}

export const edgeCacheSystem = EdgeCacheSystem.getInstance();