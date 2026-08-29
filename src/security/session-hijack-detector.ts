/**
 * SessionHijackDetector - Detects suspicious session activity.
 * Instance-based implementation for use with GuildContext.
 */

import type { SecurityModule } from "../core/interfaces/SecurityModule";

export interface SessionInfo {
  lastIp?: string;
  lastUserAgent?: string;
  timestamps: number[];
}

export class SessionHijackDetectorInstance implements SecurityModule {
  readonly name = "sessionHijackDetector";
  private userSessions = new Map<string, SessionInfo>();

  init(): void {
    // Nothing to initialize
  }

  recordAccess(userId: string, ip: string, userAgent?: string): boolean {
    const session = this.userSessions.get(userId) || { timestamps: [] };
    const now = Date.now();
    let isSuspicious = false;

    if (session.lastIp && session.lastIp !== ip) {
      console.warn(`[SESSION-HIJACK] IP Jump detected for user ${userId}: ${session.lastIp} -> ${ip}`);
      isSuspicious = true;
    }

    session.lastIp = ip;
    session.lastUserAgent = userAgent;
    session.timestamps.push(now);
    session.timestamps = session.timestamps.filter(t => now - t < 60000);

    if (session.timestamps.length > 20) {
      isSuspicious = true;
    }

    this.userSessions.set(userId, session);
    return isSuspicious;
  }

  getSession(userId: string): SessionInfo | undefined {
    return this.userSessions.get(userId);
  }

  reset(userId: string): void {
    this.userSessions.delete(userId);
  }
}

/**
 * Global singleton instance (backwards compatibility).
 * @deprecated Use GuildContext.getSessionHijackDetector() instead.
 */
export const SessionHijackDetector = new SessionHijackDetectorInstance();
