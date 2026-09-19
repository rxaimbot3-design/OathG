/**
 * TokenVault - AES-256-GCM encrypted token storage with PBKDF2 key derivation.
 * Instance-based implementation for use with GuildContext.
 */

import type { SecurityModule } from "../core/interfaces/SecurityModule";
import crypto from "crypto";
import fs from "fs";
import path from "path";

export interface VaultEntry {
  encrypted: string;
  iv: string;
  authTag: string;
}

export class TokenVaultInstance implements SecurityModule {
  readonly name = "tokenVault";
  private encryptedTokens = new Map<string, VaultEntry>();
  private masterSecret: string;
  private vaultFile: string;
  private saltFile: string;
  private cachedSalt: string | null = null;
  private isCompromised = false;

  constructor(masterSecret?: string, vaultFile?: string, saltFile?: string) {
    this.masterSecret = masterSecret || process.env.ADMIN_SECRET || crypto.randomBytes(32).toString("hex");
    this.vaultFile = vaultFile || path.join(process.cwd(), "vault_tokens.json");
    this.saltFile = saltFile || path.join(process.cwd(), "vault_salt.txt");
  }

  init(): void {
    this.loadVaultFromDisk();
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
        fs.writeFileSync(this.saltFile, newSalt, "utf8");
        this.cachedSalt = newSalt;
      }
    } catch (err) {
      console.error("[TokenVault] Failed to load salt, generating fresh random salt:", err);
      const freshSalt = crypto.randomBytes(16).toString("hex");
      try {
        fs.writeFileSync(this.saltFile, freshSalt, "utf8");
      } catch (err) {
        console.error("[TokenVault] Failed to write fresh salt to disk:", err);
      }
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
              this.encryptedTokens.set(k, v as VaultEntry);
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to load TokenVault from disk:", err);
    }
  }

  private saveVaultToDisk(): void {
    try {
      const obj: Record<string, VaultEntry> = {};
      for (const [k, v] of this.encryptedTokens.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(this.vaultFile, JSON.stringify(obj, null, 2), "utf8");
    } catch (err) {
      console.error("Failed to save TokenVault to disk:", err);
    }
  }

  store(token: string, keyName: string = "DISCORD_TOKEN"): void {
    if (!token || this.isCompromised) return;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.getKey(), iv);
    let encrypted = cipher.update(token, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");

    const data: VaultEntry = { encrypted, iv: iv.toString("hex"), authTag };
    this.encryptedTokens.set(keyName, data);
    this.saveVaultToDisk();
  }

  retrieve(keyName: string = "DISCORD_TOKEN", requesterId?: string): string {
    if (this.isCompromised) {
      this.triggerSelfDestruct("Attempted access after compromise lockdown.");
    }
    if (requesterId && !this.isAuthorized(requesterId)) {
      this.triggerSelfDestruct(`Unauthorized token access attempt by ${requesterId}`);
    }
    if (this.encryptedTokens.size === 0) {
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
    } catch (err) {
      const errStr = String(err).toLowerCase();
      if (errStr.includes("tamper") || errStr.includes("compromise") || errStr.includes("breach") || errStr.includes("memory")) {
        this.triggerSelfDestruct("Memory decryption failed - Possible memory tampering.");
      }
      throw new Error(`Decryption failed: ${err}`);
    }
  }

  private isAuthorized(requesterId: string): boolean {
    // Override this method or pass owner check via context
    return true;
  }

  triggerSelfDestruct(reason: string): never {
    console.error(`\n🚨 [SELF-DESTRUCT PROTOCOL ACTIVATED] 🚨\nReason: ${reason}`);
    console.error("Wiping memory to prevent token leak...");
    this.encryptedTokens.clear();
    this.masterSecret = crypto.randomBytes(32).toString("hex");
    this.isCompromised = true;
    try {
      if (fs.existsSync(this.vaultFile)) fs.unlinkSync(this.vaultFile);
    } catch (err) {
      console.error("[TokenVault] Self-destruct failed to delete vault file:", err);
    }
    throw new Error(`[TOKEN VAULT DENIED] Access denied: ${reason}`);
  }
}

/**
 * Global singleton instance (backwards compatibility).
 * @deprecated Use GuildContext or inject TokenVaultInstance instead.
 */
export const TokenVault = new TokenVaultInstance();
