/**
 * IPBanSystem - Persistent IP banning with file and cache backing.
 * Instance-based implementation for use with GuildContext.
 */

import type { SecurityModule } from "../core/interfaces/SecurityModule";
import { atomicWriteJsonSync } from "../SecurityFeatures";

export interface IPBanRecord {
  ip: string;
  reason: string;
  bannedBy: string;
  bannedAt: string;
  guildId?: string;
}

export interface VerifiedIPRecord {
  userId: string;
  username: string;
  ipAddress: string;
  verifiedAt: string;
}

export class IPBanSystemInstance implements SecurityModule {
  readonly name = "ipBanSystem";
  private ipBansFile: string;
  private verifiedIpsFile: string;
  private cachedBans: IPBanRecord[] = [];
  private cachedVerified: VerifiedIPRecord[] = [];

  constructor(ipBansFile?: string, verifiedIpsFile?: string) {
    this.ipBansFile = ipBansFile || "ip_bans.json";
    this.verifiedIpsFile = verifiedIpsFile || "verified_ips.json";
  }

  init(): void {
    this.loadIPBans();
    this.loadVerifiedIPs();
  }

  isBanned(ip: string): boolean {
    if (!ip) return false;
    const cleanIp = ip.replace(/^::ffff:/, "").trim();
    return this.cachedBans.some(ban => ban.ip === cleanIp);
  }

  getBans(): IPBanRecord[] {
    return [...this.cachedBans];
  }

  addBan(record: IPBanRecord): void {
    const existing = this.cachedBans.findIndex(b => b.ip === record.ip);
    if (existing >= 0) {
      this.cachedBans[existing] = record;
    } else {
      this.cachedBans.push(record);
    }
    this.saveIPBans();
  }

  removeBan(ip: string): void {
    const cleanIp = ip.replace(/^::ffff:/, "").trim();
    this.cachedBans = this.cachedBans.filter(b => b.ip !== cleanIp);
    this.saveIPBans();
  }

  recordIP(userId: string, username: string, ipAddress: string): void {
    const verified = this.loadVerifiedIPs();
    const filtered = verified.filter(v => v.userId !== userId);
    filtered.push({
      userId,
      username,
      ipAddress,
      verifiedAt: new Date().toISOString()
    });
    this.saveVerifiedIPs(filtered);
  }

  getIPsForUser(userId: string): string[] {
    const verified = this.loadVerifiedIPs();
    return verified.filter(v => v.userId === userId).map(v => v.ipAddress);
  }

  private loadIPBans(): IPBanRecord[] {
    try {
      if (!this.cachedBans.length) {
        const fs = require("fs");
        if (fs.existsSync(this.ipBansFile)) {
          this.cachedBans = JSON.parse(fs.readFileSync(this.ipBansFile, "utf8"));
        }
      }
    } catch (err) {
      console.error("Error loading IP bans:", err);
    }
    return this.cachedBans;
  }

  private saveIPBans(): void {
    try {
      atomicWriteJsonSync(this.ipBansFile, this.cachedBans);
    } catch (err) {
      console.error("Error saving IP bans:", err);
    }
  }

  private loadVerifiedIPs(): VerifiedIPRecord[] {
    try {
      if (!this.cachedVerified.length) {
        const fs = require("fs");
        if (fs.existsSync(this.verifiedIpsFile)) {
          this.cachedVerified = JSON.parse(fs.readFileSync(this.verifiedIpsFile, "utf8"));
        }
      }
    } catch (err) {
      console.error("Error loading verified IPs:", err);
    }
    return this.cachedVerified;
  }

  private saveVerifiedIPs(ips: VerifiedIPRecord[]): void {
    try {
      this.cachedVerified = ips;
      atomicWriteJsonSync(this.verifiedIpsFile, ips);
    } catch (err) {
      console.error("Error saving verified IPs:", err);
    }
  }
}

/**
 * Global singleton instance (backwards compatibility).
 * @deprecated Use GuildContext.getIPBanSystem() instead.
 */
export const IPBanSystem = new IPBanSystemInstance();
