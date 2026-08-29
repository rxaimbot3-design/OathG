import fs from "fs";
import path from "path";
import { atomicWriteJsonSync } from "./utils.js";

export interface WhitelistRecord {
  id: string;
  type: "ip" | "user";
  value: string;
  addedBy: string;
  addedAt: string;
  note?: string;
}

export interface AdminWhitelistSystemConfig {
  whitelistFile?: string;
}

export class AdminWhitelistSystem {
  private static instance: AdminWhitelistSystem;
  private whitelistFile: string;
  private cachedWhitelist: WhitelistRecord[] | null = null;

  private constructor(config: AdminWhitelistSystemConfig = {}) {
    this.whitelistFile = config.whitelistFile || path.join(process.cwd(), "admin_whitelist.json");
  }

  static getInstance(config?: AdminWhitelistSystemConfig): AdminWhitelistSystem {
    if (!AdminWhitelistSystem.instance) {
      AdminWhitelistSystem.instance = new AdminWhitelistSystem(config);
    }
    return AdminWhitelistSystem.instance;
  }

  static resetInstance(): void {
    AdminWhitelistSystem.instance = undefined as any;
  }

  loadWhitelist(): WhitelistRecord[] {
    if (this.cachedWhitelist) return this.cachedWhitelist;
    try {
      if (!fs.existsSync(this.whitelistFile)) {
        const defaults: WhitelistRecord[] = [
          { id: "wl_local_v4", type: "ip", value: "127.0.0.1", addedBy: "System", addedAt: new Date().toISOString(), note: "Localhost IPv4" },
          { id: "wl_local_v6", type: "ip", value: "::1", addedBy: "System", addedAt: new Date().toISOString(), note: "Localhost IPv6" },
          { id: "wl_local_mapped", type: "ip", value: "::ffff:127.0.0.1", addedBy: "System", addedAt: new Date().toISOString(), note: "IPv4-mapped Localhost" }
        ];
        atomicWriteJsonSync(this.whitelistFile, defaults);
        this.cachedWhitelist = defaults;
        return defaults;
      }
      this.cachedWhitelist = JSON.parse(fs.readFileSync(this.whitelistFile, "utf8"));
      return this.cachedWhitelist || [];
    } catch (err: any) {
      console.error("Error loading Admin Whitelist:", err);
      return [];
    }
  }

  saveWhitelist(records: WhitelistRecord[]): void {
    try {
      this.cachedWhitelist = records;
      atomicWriteJsonSync(this.whitelistFile, records);
    } catch (err: any) {
      console.error("Error saving Admin Whitelist:", err);
    }
  }

  isIpWhitelisted(rawIp: string): boolean {
    if (!rawIp) return false;
    const cleanIp = rawIp.replace(/^::ffff:/, "").trim();
    const records = this.loadWhitelist();

    return records.some(record => {
      if (record.type !== "ip") return false;
      const target = record.value.replace(/^::ffff:/, "").trim();
      
      if (target !== "*" && (cleanIp === target || rawIp.trim() === record.value.trim())) {
        return true;
      }
      return false;
    });
  }

  isUserWhitelisted(userId: string): boolean {
    if (!userId) return false;
    const records = this.loadWhitelist();
    return records.some((r: any) => r.type === "user" && r.value === userId);
  }

  isWhitelisted(ip: string, userId?: string): boolean {
    return this.isIpWhitelisted(ip) || (userId ? this.isUserWhitelisted(userId) : false);
  }

  addRecord(type: "ip" | "user", value: string, addedBy = "Admin", note = ""): WhitelistRecord {
    const list = this.loadWhitelist();
    const existing = list.find((r: any) => r.type === type && r.value === value.trim());
    if (existing) return existing;

    const newRecord: WhitelistRecord = {
      id: `wl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type,
      value: value.trim(),
      addedBy,
      addedAt: new Date().toISOString(),
      note
    };
    list.push(newRecord);
    this.saveWhitelist(list);
    return newRecord;
  }

  removeRecord(idOrValue: string): boolean {
    let list = this.loadWhitelist();
    const initialLen = list.length;
    list = list.filter((r: any) => r.id !== idOrValue && r.value !== idOrValue);
    if (list.length !== initialLen) {
      this.saveWhitelist(list);
      return true;
    }
    return false;
  }

  getAllRecords(): WhitelistRecord[] {
    return this.loadWhitelist();
  }

  // Static wrapper methods for backward compatibility
  static loadWhitelist(): WhitelistRecord[] {
    return this.getInstance().loadWhitelist();
  }

  static saveWhitelist(records: WhitelistRecord[]): void {
    return this.getInstance().saveWhitelist(records);
  }

  static isIpWhitelisted(rawIp: string): boolean {
    return this.getInstance().isIpWhitelisted(rawIp);
  }

  static isUserWhitelisted(userId: string): boolean {
    return this.getInstance().isUserWhitelisted(userId);
  }

  static isWhitelisted(ip: string, userId?: string): boolean {
    return this.getInstance().isWhitelisted(ip, userId);
  }

  static addRecord(type: "ip" | "user", value: string, addedBy = "Admin", note = ""): WhitelistRecord {
    return this.getInstance().addRecord(type, value, addedBy, note);
  }

  static removeRecord(idOrValue: string): boolean {
    return this.getInstance().removeRecord(idOrValue);
  }

  static getAllRecords(): WhitelistRecord[] {
    return this.getInstance().getAllRecords();
  }
}