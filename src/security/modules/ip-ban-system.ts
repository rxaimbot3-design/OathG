import fs from "fs";
import path from "path";
import crypto from "crypto";
import { atomicWriteJsonSync } from "./utils.js";

export interface IPBanRecord {
  id: string;
  userId?: string;
  ipAddress?: string;
  bannedAt: string;
  reason: string;
}

export interface VerifiedIPRecord {
  userId: string;
  ipAddress: string;
  username: string;
  verifiedAt: string;
}

export interface IPBanSystemConfig {
  ipBansFile?: string;
  verifiedIpsFile?: string;
}

export interface BanResult {
  ipAddressesBanned: string[];
}

export interface IPBanResult {
  userIdsAssociated: string[];
}

export interface UnbanResult {
  success: boolean;
  unbannedIps: string[];
  unbannedUsers: string[];
}

export class IPBanSystem {
  private static instance: IPBanSystem;
  private ipBansFile: string;
  private verifiedIpsFile: string;
  private cachedBans: IPBanRecord[] | null = null;
  private cachedVerified: VerifiedIPRecord[] | null = null;

  private constructor(config: IPBanSystemConfig = {}) {
    this.ipBansFile = config.ipBansFile || path.join(process.cwd(), "ip_bans.json");
    this.verifiedIpsFile = config.verifiedIpsFile || path.join(process.cwd(), "verified_ips.json");
  }

  static getInstance(config?: IPBanSystemConfig): IPBanSystem {
    if (!IPBanSystem.instance) {
      IPBanSystem.instance = new IPBanSystem(config);
    }
    return IPBanSystem.instance;
  }

  static resetInstance(): void {
    IPBanSystem.instance = undefined as any;
  }

  loadIPBans(): IPBanRecord[] {
    if (this.cachedBans) return this.cachedBans;
    try {
      if (!fs.existsSync(this.ipBansFile)) {
        fs.writeFileSync(this.ipBansFile, JSON.stringify([], null, 2));
        this.cachedBans = [];
        return [];
      }
      this.cachedBans = JSON.parse(fs.readFileSync(this.ipBansFile, "utf8"));
      return this.cachedBans || [];
    } catch (err: any) {
      console.error("Error loading IP bans:", err);
      return this.cachedBans || [];
    }
  }

  saveIPBans(bans: IPBanRecord[]): void {
    try {
      this.cachedBans = bans;
      atomicWriteJsonSync(this.ipBansFile, bans);
    } catch (err: any) {
      console.error("Error saving IP bans:", err);
    }
  }

  loadVerifiedIPs(): VerifiedIPRecord[] {
    if (this.cachedVerified) return this.cachedVerified;
    try {
      if (!fs.existsSync(this.verifiedIpsFile)) {
        atomicWriteJsonSync(this.verifiedIpsFile, []);
        this.cachedVerified = [];
        return [];
      }
      this.cachedVerified = JSON.parse(fs.readFileSync(this.verifiedIpsFile, "utf8"));
      return this.cachedVerified || [];
    } catch (err: any) {
      console.error("Error loading verified IPs:", err);
      return this.cachedVerified || [];
    }
  }

  saveVerifiedIPs(ips: VerifiedIPRecord[]): void {
    try {
      this.cachedVerified = ips;
      atomicWriteJsonSync(this.verifiedIpsFile, ips);
    } catch (err: any) {
      console.error("Error saving verified IPs:", err);
    }
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

  getUsersForIP(ipAddress: string): string[] {
    const verified = this.loadVerifiedIPs();
    return verified.filter(v => v.ipAddress === ipAddress).map(v => v.userId);
  }

  banUser(userId: string, reason: string): BanResult {
    const bans = this.loadIPBans();
    const ips = this.getIPsForUser(userId);

    if (!bans.some(b => b.userId === userId)) {
      bans.push({
        id: `usr_${userId}`,
        userId,
        bannedAt: new Date().toISOString(),
        reason
      });
    }

    const addedIps: string[] = [];
    for (const ip of ips) {
      if (!bans.some(b => b.ipAddress === ip)) {
        bans.push({
          id: `ip_${ip.replace(/[^a-zA-Z0-9]/g, "_")}`,
          ipAddress: ip,
          userId,
          bannedAt: new Date().toISOString(),
          reason
        });
        addedIps.push(ip);
      }
    }

    this.saveIPBans(bans);
    return { ipAddressesBanned: addedIps };
  }

  banIP(ipAddress: string, reason: string): IPBanResult {
    const bans = this.loadIPBans();

    if (!bans.some(b => b.ipAddress === ipAddress)) {
      bans.push({
        id: `ip_${ipAddress.replace(/[^a-zA-Z0-9]/g, "_")}`,
        ipAddress,
        bannedAt: new Date().toISOString(),
        reason
      });
    }

    this.saveIPBans(bans);
    return { userIdsAssociated: [] };
  }

  isBanned(userId?: string, ipAddress?: string): boolean {
    const bans = this.loadIPBans();

    if (userId) {
      const ban = bans.find(b => b.userId === userId);
      if (ban) return true;
    }

    if (ipAddress) {
      const normalizedIp = ipAddress.startsWith("::ffff:") ? ipAddress.substring(7) : ipAddress;
      const ban = bans.find(b => {
        if (!b.ipAddress) return false;
        const bIp = b.ipAddress.startsWith("::ffff:") ? b.ipAddress.substring(7) : b.ipAddress;
        return bIp === normalizedIp;
      });
      if (ban) return true;
    }

    return false;
  }

  unban(target: string): UnbanResult {
    let bans = this.loadIPBans();
    const initialCount = bans.length;

    const unbannedIps: string[] = [];
    const unbannedUsers: string[] = [];

    const toRemove = bans.filter(b => b.userId === target || b.ipAddress === target);
    for (const ban of toRemove) {
      if (ban.ipAddress && !unbannedIps.includes(ban.ipAddress)) unbannedIps.push(ban.ipAddress);
      if (ban.userId && !unbannedUsers.includes(ban.userId)) unbannedUsers.push(ban.userId);
    }

    bans = bans.filter(b => b.userId !== target && b.ipAddress !== target);
    this.saveIPBans(bans);

    return {
      success: bans.length < initialCount,
      unbannedIps,
      unbannedUsers
    };
  }

  getAllBans(): IPBanRecord[] {
    return this.loadIPBans();
  }

  getAllVerified(): VerifiedIPRecord[] {
    return this.loadVerifiedIPs();
  }

  // Static wrapper methods for backward compatibility
  static loadIPBans(): IPBanRecord[] {
    return this.getInstance().loadIPBans();
  }

  static saveIPBans(bans: IPBanRecord[]): void {
    return this.getInstance().saveIPBans(bans);
  }

  static loadVerifiedIPs(): VerifiedIPRecord[] {
    return this.getInstance().loadVerifiedIPs();
  }

  static saveVerifiedIPs(ips: VerifiedIPRecord[]): void {
    return this.getInstance().saveVerifiedIPs(ips);
  }

  static recordIP(userId: string, username: string, ipAddress: string): void {
    return this.getInstance().recordIP(userId, username, ipAddress);
  }

  static getIPsForUser(userId: string): string[] {
    return this.getInstance().getIPsForUser(userId);
  }

  static getUsersForIP(ipAddress: string): string[] {
    return this.getInstance().getUsersForIP(ipAddress);
  }

  static banUser(userId: string, reason: string): BanResult {
    return this.getInstance().banUser(userId, reason);
  }

  static banIP(ipAddress: string, reason: string): IPBanResult {
    return this.getInstance().banIP(ipAddress, reason);
  }

  static isBanned(userId?: string, ipAddress?: string): boolean {
    return this.getInstance().isBanned(userId, ipAddress);
  }

  static unban(target: string): UnbanResult {
    return this.getInstance().unban(target);
  }

  static getAllBans(): IPBanRecord[] {
    return this.getInstance().getAllBans();
  }

  static getAllVerified(): VerifiedIPRecord[] {
    return this.getInstance().getAllVerified();
  }
}