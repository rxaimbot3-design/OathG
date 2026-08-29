/**
 * AuditLogMonitor - Tracks recent audit log actions.
 * Instance-based implementation for use with GuildContext.
 */

import type { SecurityModule } from "../core/interfaces/SecurityModule";

export interface AuditAction {
  timestamp: number;
  action: string;
  executorId?: string;
  targetId?: string;
  guildId?: string;
  details?: any;
}

export class AuditLogMonitorInstance implements SecurityModule {
  readonly name = "auditLogMonitor";
  private actions: AuditAction[] = [];
  private maxActions = 1000;

  init(): void {
    // Nothing to initialize
  }

  record(action: Omit<AuditAction, "timestamp">): void {
    this.actions.push({
      ...action,
      timestamp: Date.now()
    });
    if (this.actions.length > this.maxActions) {
      this.actions.shift();
    }
  }

  getRecentActions(count: number = 50): AuditAction[] {
    return this.actions.slice(-count).reverse();
  }

  clear(): void {
    this.actions = [];
  }

  get count(): number {
    return this.actions.length;
  }
}

/**
 * Global singleton instance (backwards compatibility).
 * @deprecated Use GuildContext.getAuditMonitor() instead.
 */
export const AuditLogMonitor = new AuditLogMonitorInstance();
