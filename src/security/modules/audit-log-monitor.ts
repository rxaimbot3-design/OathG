export interface AuditLogEntry {
  timestamp: string;
  guildId: string;
  action: string;
  userId: string;
  details?: string;
}

export interface AuditLogMonitorConfig {
  maxLogs?: number;
}

export class AuditLogMonitor {
  private static instance: AuditLogMonitor;
  private logs: AuditLogEntry[] = [];
  private config: Required<AuditLogMonitorConfig>;

  private constructor(config: AuditLogMonitorConfig = {}) {
    this.config = {
      maxLogs: config.maxLogs ?? 500,
    };
  }

  static getInstance(config?: AuditLogMonitorConfig): AuditLogMonitor {
    if (!AuditLogMonitor.instance) {
      AuditLogMonitor.instance = new AuditLogMonitor(config);
    }
    return AuditLogMonitor.instance;
  }

  static resetInstance(): void {
    AuditLogMonitor.instance = undefined as any;
  }

  log(guildId: string, action: string, userId: string, details?: any): void {
    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      guildId,
      action,
      userId,
      details: details ? JSON.stringify(details) : undefined
    };
    this.logs.unshift(entry);
    if (this.logs.length > this.config.maxLogs) this.logs.pop();
    console.log(`[AUDIT] [${guildId}] ${userId} performed ${action}`);
  }

  getLogs(guildId?: string, limit = 50): AuditLogEntry[] {
    const filtered = guildId ? this.logs.filter(l => l.guildId === guildId) : this.logs;
    return filtered.slice(0, limit);
  }

  clear(): void {
    this.logs = [];
  }

  getLogCount(): number {
    return this.logs.length;
  }
}