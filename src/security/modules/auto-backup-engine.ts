import fs from "fs";
import path from "path";
import { Guild, ChannelType } from "discord.js";
import { atomicWriteJsonSync } from "./utils.js";

export interface ServerBackupData {
  timestamp: string;
  guildId: string;
  name: string;
  roles: { id: string; name: string; color: number; permissions: string; position: number; hoist: boolean }[];
  channels: { 
    id: string; 
    name: string; 
    type: number; 
    parentId: string | null; 
    topic: string | null; 
    permissions: { id: string; allow: string; deny: string }[] 
  }[];
}

export interface AutoBackupEngineConfig {
  backupDir?: string;
  maxBackupsPerGuild?: number;
}

export class AutoBackupEngine {
  private static instance: AutoBackupEngine;
  private config: Required<AutoBackupEngineConfig>;

  private constructor(config: AutoBackupEngineConfig = {}) {
    this.config = {
      backupDir: config.backupDir || path.join(process.cwd(), "backups"),
      maxBackupsPerGuild: config.maxBackupsPerGuild ?? 5,
    };
  }

  static getInstance(config?: AutoBackupEngineConfig): AutoBackupEngine {
    if (!AutoBackupEngine.instance) {
      AutoBackupEngine.instance = new AutoBackupEngine(config);
    }
    return AutoBackupEngine.instance;
  }

  static resetInstance(): void {
    AutoBackupEngine.instance = undefined as any;
  }

  async createBackup(guild: Guild): Promise<string | null> {
    try {
      if (!fs.existsSync(this.config.backupDir)) fs.mkdirSync(this.config.backupDir, { recursive: true });

      const roles = await guild.roles.fetch();
      const channels = await guild.channels.fetch();

      const backup: ServerBackupData = {
        timestamp: new Date().toISOString(),
        guildId: guild.id,
        name: guild.name,
        roles: Array.from(roles.values()).map((r: any) => ({
          id: r.id,
          name: r.name,
          color: r.color,
          permissions: r.permissions.bitfield.toString(),
          position: r.position,
          hoist: r.hoist
        })),
        channels: Array.from(channels.values()).map(c => {
          if (!c) return null;
          return {
            id: c.id,
            name: c.name,
            type: c.type,
            parentId: c.parentId,
            topic: (c as any).topic || null,
            permissions: c.permissionOverwrites.cache.map(o => ({
              id: o.id,
              allow: o.allow.bitfield.toString(),
              deny: o.deny.bitfield.toString(),
              type: o.type
            }))
          };
        }).filter(Boolean) as ServerBackupData["channels"]
      };

      const filename = `backup_${guild.id}_${Date.now()}.json`;
      fs.writeFileSync(path.join(this.config.backupDir, filename), JSON.stringify(backup, null, 2));

      const files = fs.readdirSync(this.config.backupDir)
        .filter(f => f.startsWith(`backup_${guild.id}`))
        .sort();
      if (files.length > this.config.maxBackupsPerGuild) {
        files.slice(0, files.length - this.config.maxBackupsPerGuild)
          .forEach(f => fs.unlinkSync(path.join(this.config.backupDir, f)));
      }

      return filename;
    } catch (err: any) {
      console.error(`[BACKUP] Failed for ${guild.name}:`, err.message);
      return null;
    }
  }

  getBackupDir(): string {
    return this.config.backupDir;
  }

  listBackups(guildId?: string): string[] {
    if (!fs.existsSync(this.config.backupDir)) return [];
    let files = fs.readdirSync(this.config.backupDir).filter(f => f.endsWith(".json"));
    if (guildId) {
      files = files.filter(f => f.startsWith(`backup_${guildId}`) || f.startsWith(`snap_${guildId}`));
    }
    return files.sort().reverse();
  }

  // Static wrapper methods for backward compatibility
  static async createBackup(guild: Guild): Promise<string | null> {
    return this.getInstance().createBackup(guild);
  }

  static getBackupDir(): string {
    return this.getInstance().getBackupDir();
  }

  static listBackups(guildId?: string): string[] {
    return this.getInstance().listBackups(guildId);
  }
}