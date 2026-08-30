/**
 * TokenVault - Secure token storage with Argon2id encryption and Redis persistence
 * 
 * Features:
 * - Argon2id key derivation (memory-hard, resistant to GPU/ASIC attacks)
 * - AES-256-GCM authenticated encryption
 * - Redis persistence with in-memory fallback
 * - Automatic key rotation
 * - Self-destruct on tampering
 * - Owner-only access control
 */

import crypto from "crypto";
import { Buffer } from "buffer";
import argon2 from "argon2";
import { RedisPersistence } from "./redis-persistence.js";
import { OwnerLock } from "./owner-lock.js";
import { atomicWriteJsonSync } from "./utils.js";

const VAULT_KEY_PREFIX = "vault:";
const SALT_KEY = "vault:salt";
const MASTER_KEY_VERSION = "vault:master_key_version";

export interface TokenVaultConfig {
  masterSecret?: string;
  maxEntries?: number;
  keyRotationIntervalMs?: number;
  argon2MemoryCost?: number;      // KiB (default: 65536 = 64MB)
  argon2TimeCost?: number;        // iterations (default: 3)
  argon2Parallelism?: number;     // threads (default: 4)
}

export interface EncryptedTokenData {
  encrypted: string;
  iv: string;
  authTag: string;
  keyVersion: number;  // For key rotation support
}

export interface VaultStats {
  entries: number;
  maxEntries: number;
  isCompromised: boolean;
  initialized: boolean;
  keyVersion: number;
  lastRotation: number | null;
  redisConnected: boolean;
}

export class TokenVault {
  private static instance: TokenVault;
  private encryptedTokens = new Map<string, EncryptedTokenData>();
  private masterSecret: string;
  private isCompromised = false;
  private initialized = false;
  private config: Required<TokenVaultConfig>;
  private keyVersion = 1;
  private lastRotation: number | null = null;
  private persistence: RedisPersistence;

  private constructor(config: TokenVaultConfig = {}) {
    this.config = {
      masterSecret: config.masterSecret || process.env.ADMIN_SECRET || crypto.randomBytes(32).toString("hex"),
      maxEntries: config.maxEntries ?? 100,
      keyRotationIntervalMs: config.keyRotationIntervalMs ?? 30 * 24 * 60 * 60 * 1000, // 30 days
      argon2MemoryCost: config.argon2MemoryCost ?? 65536,
      argon2TimeCost: config.argon2TimeCost ?? 3,
      argon2Parallelism: config.argon2Parallelism ?? 4,
    };
    this.persistence = RedisPersistence.getInstance();
  }

  static getInstance(config?: TokenVaultConfig): TokenVault {
    if (!TokenVault.instance) {
      TokenVault.instance = new TokenVault(config);
    }
    return TokenVault.instance;
  }

  static resetInstance(): void {
    if (TokenVault.instance) {
      TokenVault.instance.cleanup();
    }
    TokenVault.instance = undefined as any;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.persistence.connect();
    
    // Load key version
    const storedVersion = await this.persistence.get<number>(MASTER_KEY_VERSION);
    if (storedVersion) {
      this.keyVersion = storedVersion;
    }

    // Load last rotation time
    const storedRotation = await this.persistence.get<number>("vault:last_rotation");
    if (storedRotation) {
      this.lastRotation = storedRotation;
    }

    // Load salt from Redis
    const storedSalt = await this.persistence.get<string>(SALT_KEY);
    if (!storedSalt) {
      // First run - generate and store salt
      const newSalt = crypto.randomBytes(32).toString("hex");
      await this.persistence.set(SALT_KEY, newSalt);
    }

    // Load tokens from Redis
    await this.loadFromPersistence();

    // Check if key rotation is needed
    if (this.lastRotation && Date.now() - this.lastRotation > this.config.keyRotationIntervalMs) {
      await this.rotateKey();
    }

    this.initialized = true;
  }

  private async loadFromPersistence(): Promise<void> {
    try {
      const keys = await this.persistence.keys(`${VAULT_KEY_PREFIX}*`);
      for (const key of keys) {
        const data = await this.persistence.get<EncryptedTokenData>(key);
        if (data) {
          const tokenKey = key.replace(VAULT_KEY_PREFIX, "");
          this.encryptedTokens.set(tokenKey, data);
        }
      }
    } catch (err) {
      console.error("[TokenVault] Failed to load from persistence:", (err as Error).message);
    }
  }

  private async getSalt(): Promise<string> {
    const salt = await this.persistence.get<string>(SALT_KEY);
    if (!salt) {
      throw new Error("Salt not found in persistence");
    }
    return salt;
  }

  private async deriveKey(): Promise<Buffer> {
    const salt = await this.getSalt();
    const hash = await argon2.hash(this.masterSecret + this.keyVersion.toString(), {
      type: argon2.argon2id,
      memoryCost: this.config.argon2MemoryCost,
      timeCost: this.config.argon2TimeCost,
      parallelism: this.config.argon2Parallelism,
      hashLength: 32,
      salt: Buffer.from(salt, "hex"),
    });
    // Extract raw key from argon2 hash
    const parts = hash.split("$");
    const encodedHash = parts[parts.length - 1];
    return Buffer.from(encodedHash, "base64").subarray(0, 32);
  }

  async store(token: string, keyName: string = "DISCORD_TOKEN"): Promise<void> {
    if (!token) return;
    if (!this.initialized) await this.initialize();

    // Enforce max entries
    if (this.encryptedTokens.size >= this.config.maxEntries) {
      const firstKey = this.encryptedTokens.keys().next().value;
      if (firstKey) {
        await this.delete(firstKey);
      }
    }

    const key = await this.deriveKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(token, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");

    const data: EncryptedTokenData = {
      encrypted,
      iv: iv.toString("hex"),
      authTag,
      keyVersion: this.keyVersion,
    };

    this.encryptedTokens.set(keyName, data);
    await this.persistence.set(`${VAULT_KEY_PREFIX}${keyName}`, data);
  }

  async retrieve(keyName: string = "DISCORD_TOKEN", requesterId?: string, guildOwnerId?: string): Promise<string> {
    if (this.isCompromised) {
      this.triggerSelfDestruct("Attempted access after compromise lockdown.");
    }
    if (requesterId && !OwnerLock.getInstance().isOwner(requesterId, guildOwnerId)) {
      this.triggerSelfDestruct(`Unauthorized token access attempt by ${requesterId}`);
    }
    if (!this.initialized) await this.initialize();

    const tokenData = this.encryptedTokens.get(keyName);
    if (!tokenData) {
      // Try loading from persistence in case of cache miss
      const persisted = await this.persistence.get<EncryptedTokenData>(`${VAULT_KEY_PREFIX}${keyName}`);
      if (persisted) {
        this.encryptedTokens.set(keyName, persisted);
        return this.decryptWithVersion(persisted);
      }
      throw new Error(`Token Vault entry '${keyName}' is empty!`);
    }

    return this.decryptWithVersion(tokenData);
  }

  private async decryptWithVersion(data: EncryptedTokenData): Promise<string> {
    // If key version differs, derive the old key
    let key: Buffer;
    if (data.keyVersion !== this.keyVersion) {
      const oldVersion = this.keyVersion;
      this.keyVersion = data.keyVersion;
      key = await this.deriveKey();
      this.keyVersion = oldVersion;
    } else {
      key = await this.deriveKey();
    }

    try {
      const ivBuffer = Buffer.from(data.iv, "hex");
      const authTagBuffer = Buffer.from(data.authTag, "hex");
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, ivBuffer);
      decipher.setAuthTag(authTagBuffer);
      let decrypted = decipher.update(data.encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (err: any) {
      const errStr = String(err?.message || err).toLowerCase();
      if (errStr.includes("tamper") || errStr.includes("compromise") || errStr.includes("breach") || errStr.includes("memory") || errStr.includes("auth")) {
        this.triggerSelfDestruct("Memory decryption failed - Possible memory tampering or key mismatch.");
      }
      throw new Error(`Decryption failed: ${(err as Error).message}`);
    }
  }

  async delete(keyName: string): Promise<boolean> {
    const deleted = this.encryptedTokens.delete(keyName);
    if (deleted) {
      await this.persistence.del(`${VAULT_KEY_PREFIX}${keyName}`);
    }
    return deleted;
  }

  async rotateKey(newMasterSecret?: string): Promise<void> {
    console.log("[TokenVault] Initiating key rotation...");

    const oldKey = await this.deriveKey();
    const oldVersion = this.keyVersion;
    this.keyVersion++;
    
    // Update master secret if provided
    if (newMasterSecret) {
      this.masterSecret = newMasterSecret;
    }

    const newKey = await this.deriveKey();

    // Re-encrypt all tokens with new key
    const reencrypted = new Map<string, EncryptedTokenData>();
    for (const [keyName, data] of this.encryptedTokens.entries()) {
      try {
        // Decrypt with old key
        const ivBuffer = Buffer.from(data.iv, "hex");
        const authTagBuffer = Buffer.from(data.authTag, "hex");
        const decipher = crypto.createDecipheriv("aes-256-gcm", oldKey, ivBuffer);
        decipher.setAuthTag(authTagBuffer);
        let decrypted = decipher.update(data.encrypted, "hex", "utf8");
        decrypted += decipher.final("utf8");

        // Encrypt with new key
        const newIv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv("aes-256-gcm", newKey, newIv);
        let encrypted = cipher.update(decrypted, "utf8", "hex");
        encrypted += cipher.final("hex");
        const authTag = cipher.getAuthTag().toString("hex");

        const newData: EncryptedTokenData = {
          encrypted,
          iv: newIv.toString("hex"),
          authTag,
          keyVersion: this.keyVersion,
        };

        reencrypted.set(keyName, newData);
        await this.persistence.set(`${VAULT_KEY_PREFIX}${keyName}`, newData);
      } catch (err) {
        console.error(`[TokenVault] Failed to re-encrypt ${keyName}:`, (err as Error).message);
        // Keep old version for this key
        reencrypted.set(keyName, data);
      }
    }

    this.encryptedTokens = reencrypted;
    this.lastRotation = Date.now();

    // Persist new key version and rotation time
    await this.persistence.set(MASTER_KEY_VERSION, this.keyVersion);
    await this.persistence.set("vault:last_rotation", this.lastRotation);

    console.log(`[TokenVault] Key rotation complete. New version: ${this.keyVersion}`);
  }

  async triggerSelfDestruct(reason: string): Promise<never> {
    console.error(`\n🚨 [SELF-DESTRUCT PROTOCOL ACTIVATED] 🚨\nReason: ${reason}`);
    console.error("Wiping memory to prevent token leak...");
    
    // Clear all tokens
    this.encryptedTokens.clear();
    
    // Generate new master secret
    this.masterSecret = crypto.randomBytes(32).toString("hex");
    this.isCompromised = true;

    // Delete from persistence
    try {
      const keys = await this.persistence.keys(`${VAULT_KEY_PREFIX}*`);
      for (const key of keys) {
        await this.persistence.del(key);
      }
      await this.persistence.del(SALT_KEY);
      await this.persistence.del(MASTER_KEY_VERSION);
      await this.persistence.del("vault:last_rotation");
    } catch {}

    throw new Error(`[TOKEN VAULT DENIED] Access denied: ${reason}`);
  }

  isCompromisedState(): boolean {
    return this.isCompromised;
  }

  getStats(): VaultStats {
    return {
      entries: this.encryptedTokens.size,
      maxEntries: this.config.maxEntries,
      isCompromised: this.isCompromised,
      initialized: this.initialized,
      keyVersion: this.keyVersion,
      lastRotation: this.lastRotation,
      redisConnected: this.persistence.getConnectionStatus().connected,
    };
  }

  async getKeys(): Promise<string[]> {
    return Array.from(this.encryptedTokens.keys());
  }

  // Static wrapper methods for backward compatibility
  static async store(token: string, keyName?: string): Promise<void> {
    return this.getInstance().store(token, keyName);
  }

  static async retrieve(keyName?: string, requesterId?: string, guildOwnerId?: string): Promise<string> {
    return this.getInstance().retrieve(keyName, requesterId, guildOwnerId);
  }

  static async triggerSelfDestruct(reason: string): Promise<never> {
    return this.getInstance().triggerSelfDestruct(reason);
  }

  static async rotateKey(newMasterSecret?: string): Promise<void> {
    return this.getInstance().rotateKey(newMasterSecret);
  }

  static async getStats(): Promise<VaultStats> {
    return this.getInstance().getStats();
  }

  private cleanup(): void {
    this.encryptedTokens.clear();
  }
}