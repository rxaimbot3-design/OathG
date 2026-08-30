import fs from "fs";
import path from "path";
import { Guild, ChannelType } from "discord.js";
import { atomicWriteJsonSync } from "./utils.js";

export interface DailyBackupConfig {
  backupDir?: string;
}

export class DailyBackup {
  private static instance: DailyBackup;
  private config: Required<DailyBackupConfig>;

  private constructor(config: DailyBackupConfig = {}) {
    this.config = {
      backupDir: config.backupDir || path.join(process.cwd(), "backups"),
    };
  }

  static getInstance(config?: DailyBackupConfig): DailyBackup {
    if (!DailyBackup.instance) {
      DailyBackup.instance = new DailyBackup(config);
    }
    return DailyBackup.instance;
  }

  static resetInstance(): void {
    DailyBackup.instance = undefined as any;
  }

  async backupGuild(guild: Guild): Promise<string | null> {
    try {
      if (!fs.existsSync(this.config.backupDir)) fs.mkdirSync(this.config.backupDir, { recursive: true });

      const channels = await guild.channels.fetch();
      const roles = await guild.roles.fetch();

      const backup = {
        timestamp: new Date().toISOString(),
        guildId: guild.id,
        guildName: guild.name,
        channels: Array.from(channels.values()).filter(Boolean).map((c: any) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          parentId: c.parentId,
          topic: (c as any).topic || null,
          permissions: c.permissionOverwrites.cache.map((o: any) => ({
            id: o.id,
            allow: o.allow.bitfield.toString(),
            deny: o.deny.bitfield.toString()
          }))
        })),
        roles: Array.from(roles.values()).map(r => ({
          id: r.id,
          name: r.name,
          color: r.color,
          permissions: r.permissions.bitfield.toString(),
          position: r.position,
          hoist: r.hoist
        }))
      };

      const filename = `backup_${guild.id}_${Date.now()}.json`;
      fs.writeFileSync(path.join(this.config.backupDir, filename), JSON.stringify(backup, null, 2));
      console.log(`[BACKUP] Created backup for ${guild.name}: ${filename}`);
      return filename;
    } catch (err: any) {
      console.error(`[BACKUP] Failed for ${guild.name}:`, err.message);
      return null;
    }
  }

  getBackupDir(): string {
    return this.config.backupDir;
  }

  // Static wrapper methods for backward compatibility
  static async backupGuild(guild: Guild): Promise<string | null> {
    return this.getInstance().backupGuild(guild);
  }

  static getBackupDir(): string {
    return this.getInstance().getBackupDir();
  }
}