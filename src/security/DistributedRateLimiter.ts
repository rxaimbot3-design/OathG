import { EventEmitter } from "events";
import { createClient, RedisClientType } from "redis";
import { log, createModuleLogger } from "../logging/logger.js";

interface ClusterNode {
  host: string;
  port: number;
}

const logger = createModuleLogger("DistributedRateLimiter");

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  blockDurationMs?: number;
  enableRedisCluster?: boolean;
  clusterNodes?: ClusterNode[];
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  totalRequests: number;
  blocked?: boolean;
  blockExpiresAt?: number;
}

export interface DistributedRateLimitOptions {
  identifier: string;
  cost?: number;
  customKey?: string;
}

export class DistributedRateLimiter extends EventEmitter {
  private static instance: DistributedRateLimiter;
  
  private client: RedisClientType | null = null;
  private clusterClient: RedisClientType | null = null;
  private configs = new Map<string, RateLimitConfig>();
  private localCache = new Map<string, { count: number; resetTime: number; blocked: boolean; blockExpiresAt?: number }>();
  private syncInterval: NodeJS.Timeout | null = null;
  private useCluster = false;
  private connected = false;
  
  private constructor() {
    super();
  }
  
  static getInstance(): DistributedRateLimiter {
    if (!DistributedRateLimiter.instance) {
      DistributedRateLimiter.instance = new DistributedRateLimiter();
    }
    return DistributedRateLimiter.instance;
  }
  
  async initialize(config: {
    redisUrl?: string;
    clusterNodes?: ClusterNode[];
    enableCluster?: boolean;
    defaultConfig?: RateLimitConfig;
  }) {
    this.useCluster = !!(config.enableCluster && config.clusterNodes && config.clusterNodes.length > 0);
    
    if (this.useCluster) {
      await this.initializeCluster(config.clusterNodes!);
    } else if (config.redisUrl) {
      await this.initializeSingle(config.redisUrl);
    } else {
      log.warn({ module: "DistributedRateLimiter" }, "No Redis configuration provided, using local-only rate limiting");
      this.connected = true;
    }
    
    if (config.defaultConfig) {
      this.setDefaultConfig(config.defaultConfig);
    }
    
    // Add default security_events config for security event rate limiting
    if (!this.configs.has("security_events")) {
      this.setConfig("security_events", {
        windowMs: 60000,
        maxRequests: 50,
        keyPrefix: "ratelimit:security",
        blockDurationMs: 300000
      });
    }
    
    this.startLocalSync();
    log.info({ module: "DistributedRateLimiter" }, "DistributedRateLimiter initialized", { cluster: this.useCluster });
  }
  
  private async initializeCluster(nodes: ClusterNode[]) {
    try {
      this.clusterClient = createClient({
        socket: {
          host: nodes[0].host,
          port: nodes[0].port
        }
      }) as any;
      
      await this.clusterClient!.connect();
      this.connected = true;
      log.info({ module: "DistributedRateLimiter" }, "Redis Cluster connected");
    } catch (err) {
      log.error({ module: "DistributedRateLimiter" }, "Failed to connect to Redis Cluster", { error: err });
      throw err;
    }
  }
  
  private async initializeSingle(redisUrl: string) {
    try {
      this.client = createClient({ url: redisUrl });
      await this.client.connect();
      this.connected = true;
      log.info({ module: "DistributedRateLimiter" }, "Redis connected");
    } catch (err) {
      log.error({ module: "DistributedRateLimiter" }, "Failed to connect to Redis", { error: err });
      throw err;
    }
  }
  
  setDefaultConfig(config: RateLimitConfig) {
    this.configs.set("default", config);
  }
  
  setConfig(key: string, config: RateLimitConfig) {
    this.configs.set(key, config);
  }
  
  getConfig(key: string = "default"): RateLimitConfig | undefined {
    return this.configs.get(key);
  }
  
  async checkLimit(options: DistributedRateLimitOptions, configKey: string = "default"): Promise<RateLimitResult> {
    const config = this.configs.get(configKey) || this.configs.get("default");
    if (!config) {
      throw new Error(`Rate limit config '${configKey}' not found`);
    }
    
    const key = options.customKey || `${config.keyPrefix}:${options.identifier}`;
    const cost = options.cost || 1;
    const now = Date.now();
    const windowStart = now - config.windowMs;
    
    let result: RateLimitResult;
    
    if (this.connected && (this.client || this.clusterClient)) {
      result = await this.checkLimitRedis(key, config, cost, now, windowStart);
    } else {
      result = this.checkLimitLocal(key, config, cost, now, windowStart);
    }
    
    if (!result.allowed && config.blockDurationMs) {
      await this.blockIdentifier(key, config.blockDurationMs, now);
      result.blocked = true;
      result.blockExpiresAt = now + config.blockDurationMs;
    }
    
    return result;
  }
  
  private async checkLimitRedis(
    key: string,
    config: RateLimitConfig,
    cost: number,
    now: number,
    windowStart: number
  ): Promise<RateLimitResult> {
    const redis = this.clusterClient || this.client!;
    const luaScript = `
      local key = KEYS[1]
      local window_start = tonumber(ARGV[1])
      local window_ms = tonumber(ARGV[2])
      local max_requests = tonumber(ARGV[3])
      local cost = tonumber(ARGV[4])
      local now = tonumber(ARGV[5])
      local block_key = key .. ":block"
      
      local blocked = redis.call('GET', block_key)
      if blocked then
        local ttl = redis.call('TTL', block_key)
        return {0, 0, now + (ttl * 1000), 0, 1, now + (ttl * 1000)}
      end
      
      redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)
      local current = redis.call('ZCARD', key)
      
      if current + cost > max_requests then
        return {0, max_requests - current, now + window_ms, current + cost, 0, 0}
      end
      
      for i = 1, cost do
        redis.call('ZADD', key, now, now .. ':' .. i .. ':' .. math.random())
      end
      redis.call('PEXPIRE', key, window_ms)
      
      return {1, max_requests - current - cost, now + window_ms, current + cost, 0, 0}
    `;
    
    try {
      const result = await redis.eval(luaScript, {
        keys: [key],
        arguments: [windowStart.toString(), config.windowMs.toString(), config.maxRequests.toString(), cost.toString(), now.toString()]
      }) as any[];
      
      return {
        allowed: result[0] === 1,
        remaining: Math.max(0, result[1]),
        resetTime: result[2],
        totalRequests: result[3],
        blocked: result[4] === 1,
        blockExpiresAt: result[5]
      };
    } catch (err) {
      log.error({ module: "DistributedRateLimiter" }, "Redis rate limit check failed, falling back to local", { error: err });
      return this.checkLimitLocal(key, config, cost, now, windowStart);
    }
  }
  
  private checkLimitLocal(
    key: string,
    config: RateLimitConfig,
    cost: number,
    now: number,
    windowStart: number
  ): RateLimitResult {
    let entry = this.localCache.get(key);
    
    if (!entry || entry.resetTime < now) {
      entry = { count: 0, resetTime: now + config.windowMs, blocked: false };
      this.localCache.set(key, entry);
    }
    
    if (entry.blocked && entry.blockExpiresAt && entry.blockExpiresAt > now) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.blockExpiresAt,
        totalRequests: entry.count,
        blocked: true,
        blockExpiresAt: entry.blockExpiresAt
      };
    }
    
    if (entry.blocked && entry.blockExpiresAt && entry.blockExpiresAt <= now) {
      entry.blocked = false;
      entry.blockExpiresAt = undefined;
      entry.count = 0;
      entry.resetTime = now + config.windowMs;
    }
    
    const newCount = entry.count + cost;
    
    if (newCount > config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime,
        totalRequests: newCount
      };
    }
    
    entry.count = newCount;
    this.localCache.set(key, entry);
    
    return {
      allowed: true,
      remaining: config.maxRequests - newCount,
      resetTime: entry.resetTime,
      totalRequests: newCount
    };
  }
  
  private async blockIdentifier(key: string, durationMs: number, now: number): Promise<void> {
    const blockKey = `${key}:block`;
    
    if (this.connected && (this.client || this.clusterClient)) {
      const redis = this.clusterClient || this.client!;
      try {
        await redis.set(blockKey, "1", { PX: durationMs });
      } catch (err) {
        log.error({ module: "DistributedRateLimiter" }, "Failed to set block in Redis", { error: err });
      }
    }
    
    const entry = this.localCache.get(key) || { count: 0, resetTime: now + durationMs, blocked: false };
    entry.blocked = true;
    entry.blockExpiresAt = now + durationMs;
    this.localCache.set(key, entry);
  }
  
  async unblockIdentifier(identifier: string, configKey: string = "default"): Promise<void> {
    const config = this.configs.get(configKey) || this.configs.get("default");
    if (!config) return;
    
    const key = `${config.keyPrefix}:${identifier}`;
    const blockKey = `${key}:block`;
    
    if (this.connected && (this.client || this.clusterClient)) {
      const redis = this.clusterClient || this.client!;
      try {
        await redis.del([key, blockKey]);
      } catch (err) {
        log.error({ module: "DistributedRateLimiter" }, "Failed to unblock in Redis", { error: err });
      }
    }
    
    this.localCache.delete(key);
    this.localCache.delete(blockKey);
  }
  
  async getCurrentUsage(identifier: string, configKey: string = "default"): Promise<{ count: number; remaining: number; resetTime: number }> {
    const config = this.configs.get(configKey) || this.configs.get("default");
    if (!config) throw new Error("Config not found");
    
    const key = `${config.keyPrefix}:${identifier}`;
    const now = Date.now();
    
    if (this.connected && (this.client || this.clusterClient)) {
      const redis = this.clusterClient || this.client!;
      try {
        const windowStart = now - config.windowMs;
        await redis.zRemRangeByScore(key, "-inf", windowStart);
        const count = await redis.zCard(key);
        const ttl = await redis.pTTL(key);
        return {
          count,
          remaining: Math.max(0, config.maxRequests - count),
          resetTime: now + (ttl > 0 ? ttl : config.windowMs)
        };
      } catch (err) {
        log.error({ module: "DistributedRateLimiter" }, "Failed to get usage from Redis", { error: err });
      }
    }
    
    const entry = this.localCache.get(key);
    if (!entry || entry.resetTime < now) {
      return { count: 0, remaining: config.maxRequests, resetTime: now + config.windowMs };
    }
    
    return {
      count: entry.count,
      remaining: Math.max(0, config.maxRequests - entry.count),
      resetTime: entry.resetTime
    };
  }
  
  private startLocalSync() {
    this.syncInterval = setInterval(() => {
      this.cleanupLocalCache();
    }, 60000);
  }
  
  private cleanupLocalCache() {
    const now = Date.now();
    for (const [key, entry] of this.localCache.entries()) {
      if (entry.resetTime < now && (!entry.blocked || (entry.blockExpiresAt && entry.blockExpiresAt < now))) {
        this.localCache.delete(key);
      }
    }
    
    if (this.localCache.size > 100000) {
      const entries = Array.from(this.localCache.entries());
      entries.sort((a, b) => a[1].resetTime - b[1].resetTime);
      const toDelete = entries.slice(0, entries.length - 50000);
      for (const [key] of toDelete) {
        this.localCache.delete(key);
      }
    }
  }
  
  async healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    if (!this.connected || (!this.client && !this.clusterClient)) {
      return { healthy: false, error: "Not connected" };
    }
    
    const redis = this.clusterClient || this.client!;
    try {
      const start = Date.now();
      await redis.ping();
      return { healthy: true, latency: Date.now() - start };
    } catch (err) {
      return { healthy: false, error: String(err) };
    }
  }
  
  getStats() {
    return {
      connected: this.connected,
      useCluster: this.useCluster,
      configs: this.configs.size,
      localCacheSize: this.localCache.size,
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024
    };
  }
  
  async shutdown() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
    
    if (this.clusterClient) {
      await this.clusterClient.quit();
      this.clusterClient = null;
    }
    
    this.connected = false;
    this.localCache.clear();
    this.configs.clear();
    this.removeAllListeners();
    log.info({ module: "DistributedRateLimiter" }, "DistributedRateLimiter shutdown complete");
  }
}

export const distributedRateLimiter = DistributedRateLimiter.getInstance();