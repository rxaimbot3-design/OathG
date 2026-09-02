/**
 * Redis Persistence Layer
 * Provides unified Redis access with in-memory fallback for all state modules
 * Supports both standard Redis (TCP) and Upstash Redis (REST API)
 */

import { createClient, RedisClientType, RedisModules } from "redis";
import { MongoRedisEngine } from "./mongo-redis-engine.js";

interface UpstashResponse<T> {
  result: T;
}

export interface PersistenceConfig {
  redisUrl?: string;
  keyPrefix?: string;
  defaultTtlMs?: number;
  enableOfflineQueue?: boolean;
}

export class RedisPersistence {
  private static instance: RedisPersistence;
  private client: RedisClientType | null = null;
  private isConnected = false;
  private config: Required<PersistenceConfig>;
  private connectionPromise: Promise<void> | null = null;
  private localCache = new Map<string, { value: string; expiresAt: number }>();
  // Upstash REST API config
  private upstashUrl: string | null = null;
  private upstashToken: string | null = null;
  private useUpstash = false;

  private constructor(config: PersistenceConfig = {}) {
    this.config = {
      redisUrl: config.redisUrl ?? process.env.REDIS_URL ?? "redis://localhost:6379",
      keyPrefix: config.keyPrefix ?? "bot:security:",
      defaultTtlMs: config.defaultTtlMs ?? 24 * 60 * 60 * 1000,
      enableOfflineQueue: config.enableOfflineQueue ?? true,
    };
  }

  static getInstance(config?: PersistenceConfig): RedisPersistence {
    if (!RedisPersistence.instance) {
      RedisPersistence.instance = new RedisPersistence(config);
    }
    return RedisPersistence.instance;
  }

  static resetInstance(): void {
    if (RedisPersistence.instance) {
      RedisPersistence.instance.disconnect();
    }
    RedisPersistence.instance = undefined as any;
  }

  // Upstash REST API request helper
  private async upstashRequest<T>(command: string, ...args: string[]): Promise<T> {
    if (!this.useUpstash || !this.upstashUrl || !this.upstashToken) {
      throw new Error("Upstash not configured");
    }
    
    const body = [command, ...args];
    const response = await fetch(this.upstashUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.upstashToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upstash request failed: ${response.status} ${errorText}`);
    }
    
    const data = await response.json() as UpstashResponse<T>;
    return data.result;
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = (async () => {
      try {
        // Check for Upstash REST API credentials first
        const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
        const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
        
        if (upstashUrl && upstashToken) {
          this.upstashUrl = upstashUrl.replace(/\/$/, "");
          this.upstashToken = upstashToken;
          this.useUpstash = true;
          console.log("[RedisPersistence] Upstash REST API configured, using HTTP-based Redis.");
          // Test connection
          await this.upstashRequest("PING");
          this.isConnected = true;
          console.log("[RedisPersistence] Connected to Upstash Redis via REST API.");
          return;
        }

        // Fallback to standard Redis TCP connection
        this.useUpstash = false;
        this.client = createClient({
          url: this.config.redisUrl,
          socket: {
            reconnectStrategy: (retries) => {
              if (retries > 10) return new Error("Max retries reached");
              return Math.min(retries * 100, 3000);
            },
          },
        }) as RedisClientType;

        this.client.on("error", (err) => {
          console.error("[RedisPersistence] Connection error:", err.message);
          this.isConnected = false;
        });

        this.client.on("connect", () => {
          console.log("[RedisPersistence] Connected to Redis");
          this.isConnected = true;
        });

        this.client.on("disconnect", () => {
          console.warn("[RedisPersistence] Disconnected from Redis");
          this.isConnected = false;
        });

        await this.client.connect();
      } catch (err) {
        console.warn("[RedisPersistence] Failed to connect, using in-memory fallback:", (err as Error).message);
        this.client = null;
        this.isConnected = false;
      }
    })();

    return this.connectionPromise;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
    }
  }

  private getKey(key: string): string {
    return `${this.config.keyPrefix}${key}`;
  }

  private getTtlSeconds(ttlMs?: number): number {
    return Math.ceil((ttlMs ?? this.config.defaultTtlMs) / 1000);
  }

  async set(key: string, value: any, ttlMs?: number): Promise<void> {
    const fullKey = this.getKey(key);
    const serialized = JSON.stringify(value);
    const ttlSec = this.getTtlSeconds(ttlMs);

    if (this.isConnected) {
      try {
        if (this.useUpstash) {
          await this.upstashRequest("SET", fullKey, serialized, "EX", String(ttlSec));
        } else if (this.client) {
          await this.client.setEx(fullKey, ttlSec, serialized);
        }
        return;
      } catch (err) {
        console.warn("[RedisPersistence] Set failed, falling back to memory:", (err as Error).message);
        this.isConnected = false;
      }
    }

    // In-memory fallback
    this.localCache.set(fullKey, {
      value: serialized,
      expiresAt: Date.now() + (ttlMs ?? this.config.defaultTtlMs),
    });
    this.cleanupLocalCache();
  }

  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.getKey(key);

    if (this.isConnected) {
      try {
        let value: string | null = null;
        if (this.useUpstash) {
          value = await this.upstashRequest<string | null>("GET", fullKey);
        } else if (this.client) {
          value = await this.client.get(fullKey);
        }
        if (value) return JSON.parse(value) as T;
      } catch (err) {
        console.warn("[RedisPersistence] Get failed, falling back to memory:", (err as Error).message);
        this.isConnected = false;
      }
    }

    // In-memory fallback
    const entry = this.localCache.get(fullKey);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.localCache.delete(fullKey);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  async del(key: string): Promise<void> {
    const fullKey = this.getKey(key);

    if (this.isConnected) {
      try {
        if (this.useUpstash) {
          await this.upstashRequest("DEL", fullKey);
        } else if (this.client) {
          await this.client.del(fullKey);
        }
      } catch (err) {
        console.warn("[RedisPersistence] Del failed:", (err as Error).message);
      }
    }

    this.localCache.delete(fullKey);
  }

  async exists(key: string): Promise<boolean> {
    const fullKey = this.getKey(key);

    if (this.isConnected) {
      try {
        if (this.useUpstash) {
          const result = await this.upstashRequest<number>("EXISTS", fullKey);
          return result === 1;
        } else if (this.client) {
          return await this.client.exists(fullKey) === 1;
        }
      } catch (err) {
        console.warn("[RedisPersistence] Exists failed:", (err as Error).message);
      }
    }

    const entry = this.localCache.get(fullKey);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.localCache.delete(fullKey);
      return false;
    }
    return true;
  }

  async keys(pattern: string): Promise<string[]> {
    const fullPattern = this.getKey(pattern);

    if (this.isConnected) {
      try {
        if (this.useUpstash) {
          // Upstash REST API doesn't support KEYS, but supports SCAN
          return await this.upstashScanKeys(fullPattern);
        } else if (this.client) {
          // Use SCAN instead of KEYS to avoid blocking Redis event loop
          return await this.scanKeys(fullPattern);
        }
      } catch (err) {
        console.warn("[RedisPersistence] Keys failed:", (err as Error).message);
      }
    }

    // In-memory fallback
    const regex = new RegExp("^" + fullPattern.replace(/\*/g, ".*") + "$");
    return Array.from(this.localCache.keys()).filter(k => regex.test(k));
  }

  /**
   * SCAN-based key iteration for standard Redis (TCP)
   * Avoids blocking KEYS command
   */
  private async scanKeys(pattern: string): Promise<string[]> {
    if (!this.client) return [];
    
    const keys: string[] = [];
    let cursor = 0;
    
    do {
      // Redis SCAN returns { cursor: number, keys: string[] }
      const result = await this.client.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor;
      keys.push(...result.keys);
    } while (cursor !== 0);
    
    return keys;
  }

  /**
   * SCAN-based key iteration for Upstash REST API
   * Upstash supports SCAN command via REST API
   */
  private async upstashScanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = "0";
    
    do {
      // Upstash SCAN returns [cursor, keys[]]
      const result = await this.upstashRequest<[string, string[]]>("SCAN", cursor, "MATCH", pattern, "COUNT", "100");
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== "0");
    
    return keys;
  }

  async hset(key: string, field: string, value: any): Promise<void> {
    const fullKey = this.getKey(key);
    const serialized = JSON.stringify(value);

    if (this.isConnected) {
      try {
        if (this.useUpstash) {
          await this.upstashRequest("HSET", fullKey, field, serialized);
          return;
        } else if (this.client) {
          await this.client.hSet(fullKey, field, serialized);
          return;
        }
      } catch (err) {
        console.warn("[RedisPersistence] HSet failed:", (err as Error).message);
      }
    }

    // In-memory fallback using flat keys
    this.localCache.set(`${fullKey}:${field}`, {
      value: serialized,
      expiresAt: Date.now() + this.config.defaultTtlMs,
    });
  }

  async hget<T>(key: string, field: string): Promise<T | null> {
    const fullKey = this.getKey(key);

    if (this.isConnected) {
      try {
        let value: string | null = null;
        if (this.useUpstash) {
          value = await this.upstashRequest<string | null>("HGET", fullKey, field);
        } else if (this.client) {
          const rawValue = await this.client.hGet(fullKey, field);
          value = rawValue ?? null;
        }
        if (value) return JSON.parse(value) as T;
      } catch (err) {
        console.warn("[RedisPersistence] HGet failed:", (err as Error).message);
      }
    }

    const entry = this.localCache.get(`${fullKey}:${field}`);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.localCache.delete(`${fullKey}:${field}`);
      return null;
    }
    return JSON.parse(entry.value) as T;
  }

  async hgetall<T>(key: string): Promise<Record<string, T>> {
    const fullKey = this.getKey(key);
    const result: Record<string, T> = {};

    if (this.isConnected) {
      try {
        if (this.useUpstash) {
          // Upstash REST API doesn't support HGETALL directly
          // Fall back to in-memory
        } else if (this.client) {
          const data = await this.client.hGetAll(fullKey);
          for (const [field, value] of Object.entries(data)) {
            result[field] = JSON.parse(value) as T;
          }
          return result;
        }
      } catch (err) {
        console.warn("[RedisPersistence] HGetAll failed:", (err as Error).message);
      }
    }

    // In-memory fallback
    const prefix = `${fullKey}:`;
    for (const [k, entry] of this.localCache.entries()) {
      if (k.startsWith(prefix)) {
        const field = k.slice(prefix.length);
        if (Date.now() <= entry.expiresAt) {
          result[field] = JSON.parse(entry.value) as T;
        }
      }
    }
    return result;
  }

  async hdel(key: string, field: string): Promise<void> {
    const fullKey = this.getKey(key);

    if (this.isConnected) {
      try {
        if (this.useUpstash) {
          await this.upstashRequest("HDEL", fullKey, field);
        } else if (this.client) {
          await this.client.hDel(fullKey, field);
        }
      } catch (err) {
        console.warn("[RedisPersistence] HDel failed:", (err as Error).message);
      }
    }

    this.localCache.delete(`${fullKey}:${field}`);
  }

  async incr(key: string, ttlMs?: number): Promise<number> {
    const fullKey = this.getKey(key);
    const ttlSec = this.getTtlSeconds(ttlMs);

    if (this.isConnected) {
      try {
        if (this.useUpstash) {
          const count = await this.upstashRequest<number>("INCR", fullKey);
          if (count === 1) {
            await this.upstashRequest("EXPIRE", fullKey, String(ttlSec));
          }
          return count;
        } else if (this.client) {
          const count = await this.client.incr(fullKey);
          if (count === 1) {
            await this.client.expire(fullKey, ttlSec);
          }
          return count;
        }
      } catch (err) {
        console.warn("[RedisPersistence] Incr failed:", (err as Error).message);
      }
    }

    // In-memory fallback
    const entry = this.localCache.get(fullKey);
    let count = 1;
    if (entry && Date.now() <= entry.expiresAt) {
      count = parseInt(entry.value) + 1;
    }
    this.localCache.set(fullKey, {
      value: count.toString(),
      expiresAt: Date.now() + (ttlMs ?? this.config.defaultTtlMs),
    });
    return count;
  }

  async expire(key: string, ttlMs: number): Promise<boolean> {
    const fullKey = this.getKey(key);
    const ttlSec = this.getTtlSeconds(ttlMs);

    if (this.isConnected) {
      try {
        if (this.useUpstash) {
          await this.upstashRequest("EXPIRE", fullKey, String(ttlSec));
          return true;
        } else if (this.client) {
          return await this.client.expire(fullKey, ttlSec);
        }
      } catch (err) {
        console.warn("[RedisPersistence] Expire failed:", (err as Error).message);
      }
    }

    const entry = this.localCache.get(fullKey);
    if (entry) {
      entry.expiresAt = Date.now() + ttlMs;
      return true;
    }
    return false;
  }

  async ttl(key: string): Promise<number> {
    const fullKey = this.getKey(key);

    if (this.isConnected) {
      try {
        if (this.useUpstash) {
          return await this.upstashRequest<number>("TTL", fullKey);
        } else if (this.client) {
          return await this.client.ttl(fullKey);
        }
      } catch (err) {
        console.warn("[RedisPersistence] TTL failed:", (err as Error).message);
      }
    }

    const entry = this.localCache.get(fullKey);
    if (!entry) return -2;
    const remaining = entry.expiresAt - Date.now();
    return remaining > 0 ? Math.ceil(remaining / 1000) : -2;
  }

  private cleanupLocalCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.localCache.entries()) {
      if (now > entry.expiresAt) {
        this.localCache.delete(key);
      }
    }

    // Prevent unbounded growth
    if (this.localCache.size > 10000) {
      const entries = Array.from(this.localCache.entries());
      entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
      const toDelete = entries.slice(0, entries.length - 8000);
      for (const [key] of toDelete) {
        this.localCache.delete(key);
      }
    }
  }

  getConnectionStatus(): { connected: boolean; localCacheSize: number } {
    return {
      connected: this.isConnected,
      localCacheSize: this.localCache.size,
    };
  }

  // Initialize from MongoRedisEngine if available
  static async initFromMongoRedis(): Promise<RedisPersistence> {
    const instance = RedisPersistence.getInstance();
    await MongoRedisEngine.initRedis();
    // If MongoRedisEngine has Redis, use it
    if (MongoRedisEngine.isRedisConnected) {
      // We can't directly access the client, but we can use the persistence layer
      // The MongoRedisEngine will be used as fallback
    }
    return instance;
  }
}