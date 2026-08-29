import fs from "fs";
import crypto from "crypto";
import path from "path";
import { Buffer } from "buffer";
import { LruMap } from "../MapManager.js";
import { atomicWriteJsonSync } from "./utils.js";
import { OwnerLock } from "./owner-lock.js";

const AI_QUOTA_WARNING = "AI Quota limit reached in SecurityFeatures.";

export interface TokenVaultConfig {
  vaultFile?: string;
  saltFile?: string;
  masterSecret?: string;
  maxEntries?: number;
}

export interface EncryptedTokenData {
  encrypted: string;
  iv: string;
  authTag: string;
}

export class TokenVault {
  private static instance: TokenVault;
  private encryptedTokens: LruMap<string, EncryptedTokenData>;
  private masterSecret: string;
  private isCompromised = false;
  private vaultFile: string;
  private saltFile: string;
  private cachedSalt: string | null = null;
  private initialized = false;

  private constructor(config: TokenVaultConfig = {}) {
    this.encryptedTokens = new LruMap<string, EncryptedTokenData>(config.maxEntries ?? 100);
    this.masterSecret = config.masterSecret || process.env.ADMIN_SECRET || crypto.randomBytes(32).toString("hex");
    this.vaultFile = config.vaultFile || path.join(process.cwd(), "vault_tokens.json");
    this.saltFile = config.saltFile || path.join(process.cwd(), "vault_salt.txt");
  }

  static getInstance(config?: TokenVaultConfig): TokenVault {
    if (!TokenVault.instance) {
      TokenVault.instance = new TokenVault(config);
    }
    return TokenVault.instance;
  }

  static resetInstance(): void {
    TokenVault.instance = undefined as any;
  }

  private getSalt(): string {
    if (this.cachedSalt) return this.cachedSalt;
    try {
      if (fs.existsSync(this.saltFile)) {
        let rawSalt = fs.readFileSync(this.saltFile, "utf8").trim();
        if (rawSalt.startsWith('"') && rawSalt.endsWith('"')) {
          rawSalt = rawSalt.slice(1, -1);
        }
        if (rawSalt && rawSalt.length >= 16) {
          this.cachedSalt = rawSalt;
        } else {
          throw new Error("Salt file corrupted or too short");
        }
      } else {
        const newSalt = crypto.randomBytes(16).toString("hex");
        atomicWriteJsonSync(this.saltFile, newSalt);
        this.cachedSalt = newSalt;
      }
    } catch (err) {
      console.error("[TokenVault] Failed to load salt, generating fresh random salt:", err);
      const freshSalt = crypto.randomBytes(16).toString("hex");
      try {
        atomicWriteJsonSync(this.saltFile, freshSalt);
      } catch {}
      this.cachedSalt = freshSalt;
    }
    return this.cachedSalt;
  }

  private getKey(): Buffer {
    return crypto.pbkdf2Sync(this.masterSecret, this.getSalt(), 100000, 32, "sha256");
  }

  private loadVaultFromDisk(): void {
    try {
      if (fs.existsSync(this.vaultFile)) {
        const raw = fs.readFileSync(this.vaultFile, "utf8");
        const parsed = JSON.parse(raw);
        if (typeof parsed === "object" && parsed !== null) {
          for (const [k, v] of Object.entries(parsed)) {
            if (v && typeof v === "object" && "encrypted" in (v as any) && "iv" in (v as any) && "authTag" in (v as any)) {
              this.encryptedTokens.set(k, v as EncryptedTokenData);
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to load TokenVault from disk:", e);
    }
    this.initialized = true;
  }

  private saveVaultToDisk(): void {
    try {
      const obj: Record<string, any> = {};
      for (const [k, v] of this.encryptedTokens.entries()) {
        obj[k] = v;
      }
      atomicWriteJsonSync(this.vaultFile, obj);
    } catch (e) {
      console.error("Failed to save TokenVault to disk:", e);
    }
  }

  store(token: string, keyName: string = "DISCORD_TOKEN"): void {
    if (!token) return;
    if (!this.initialized) this.loadVaultFromDisk();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.getKey(), iv);
    let encrypted = cipher.update(token, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");

    const data: EncryptedTokenData = { encrypted, iv: iv.toString("hex"), authTag };
    this.encryptedTokens.set(keyName, data);
    this.saveVaultToDisk();
  }

  retrieve(keyName: string = "DISCORD_TOKEN", requesterId?: string, guildOwnerId?: string): string {
    if (this.isCompromised) {
      this.triggerSelfDestruct("Attempted access after compromise lockdown.");
    }
    if (requesterId && !OwnerLock.getInstance().isOwner(requesterId, guildOwnerId)) {
      this.triggerSelfDestruct(`Unauthorized token access attempt by ${requesterId}`);
    }
    if (!this.initialized || this.encryptedTokens.size === 0) {
      this.loadVaultFromDisk();
    }
    const tokenData = this.encryptedTokens.get(keyName);
    if (!tokenData) throw new Error(`Token Vault entry '${keyName}' is empty!`);

    try {
      const ivBuffer = Buffer.from(tokenData.iv, "hex");
      const authTagBuffer = Buffer.from(tokenData.authTag, "hex");
      const decipher = crypto.createDecipheriv("aes-256-gcm", this.getKey(), ivBuffer);
      decipher.setAuthTag(authTagBuffer);
      let decrypted = decipher.update(tokenData.encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (err: any) {
      const errStr = String(err?.message || err).toLowerCase();
      if (errStr.includes("tamper") || errStr.includes("compromise") || errStr.includes("breach") || errStr.includes("memory")) {
        this.triggerSelfDestruct("Memory decryption failed - Possible memory tampering.");
      }
      throw new Error(`Decryption failed: ${(err as Error).message}`);
    }
  }

  triggerSelfDestruct(reason: string): never {
    console.error(`\n🚨 [SELF-DESTRUCT PROTOCOL ACTIVATED] 🚨\nReason: ${reason}`);
    console.error("Wiping memory to prevent token leak...");
    this.encryptedTokens.clear();
    this.masterSecret = crypto.randomBytes(32).toString("hex");
    this.isCompromised = true;
    try {
      if (fs.existsSync(this.vaultFile)) fs.unlinkSync(this.vaultFile);
    } catch {}
    throw new Error(`[TOKEN VAULT DENIED] Access denied: ${reason}`);
  }

  isCompromisedState(): boolean {
    return this.isCompromised;
  }

  getStats() {
    return {
      entries: this.encryptedTokens.size,
      maxEntries: this.encryptedTokens.maxSize,
      isCompromised: this.isCompromised,
      initialized: this.initialized,
    };
  }

  // Static wrapper methods for backward compatibility
  static store(token: string, keyName?: string): void {
    return this.getInstance().store(token, keyName);
  }

  static retrieve(keyName?: string, requesterId?: string): string {
    return this.getInstance().retrieve(keyName, requesterId);
  }

  static triggerSelfDestruct(reason: string): never {
    return this.getInstance().triggerSelfDestruct(reason);
  }
}