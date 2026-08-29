import { TtlMap } from "../MapManager.js";
import { BehaviorScoring } from "./behavior-scoring.js";

export interface SessionData {
  lastIp?: string;
  lastUserAgent?: string;
  timestamps: number[];
}

export interface SessionHijackDetectorConfig {
  maxEntries?: number;
  ttlMs?: number;
  autoCleanupMs?: number;
  maxEventsPerMinute?: number;
}

export class SessionHijackDetector {
  private static instance: SessionHijackDetector;
  private userSessions: TtlMap<string, SessionData>;
  private config: Required<SessionHijackDetectorConfig>;

  private constructor(config: SessionHijackDetectorConfig = {}) {
    this.config = {
      maxEntries: config.maxEntries ?? 10000,
      ttlMs: config.ttlMs ?? 60 * 60 * 1000,
      autoCleanupMs: config.autoCleanupMs ?? 300000,
      maxEventsPerMinute: config.maxEventsPerMinute ?? 20,
    };
    this.userSessions = new TtlMap<string, SessionData>({
      ttlMs: this.config.ttlMs,
      maxEntries: this.config.maxEntries,
      autoCleanupMs: this.config.autoCleanupMs,
    });
  }

  static getInstance(config?: SessionHijackDetectorConfig): SessionHijackDetector {
    if (!SessionHijackDetector.instance) {
      SessionHijackDetector.instance = new SessionHijackDetector(config);
    }
    return SessionHijackDetector.instance;
  }

  static resetInstance(): void {
    SessionHijackDetector.instance = undefined as any;
  }

  recordAccess(userId: string, ip: string, userAgent?: string): boolean {
    const session = this.userSessions.get(userId) || { timestamps: [] };
    const now = Date.now();
    let isSuspicious = false;

    if (session.lastIp && session.lastIp !== ip) {
      console.warn(`[SESSION-HIJACK] IP Jump detected for user ${userId}: ${session.lastIp} -> ${ip}`);
      isSuspicious = true;
      BehaviorScoring.getInstance().addRisk(userId, 40, "Rapid IP Jump / Possible Session Hijack");
    }

    session.lastIp = ip;
    session.lastUserAgent = userAgent;
    session.timestamps.push(now);
    session.timestamps = session.timestamps.filter(t => now - t < 60000);

    if (session.timestamps.length > this.config.maxEventsPerMinute) {
      isSuspicious = true;
      BehaviorScoring.getInstance().addRisk(userId, 30, "Abnormal Session Event Burst");
    }

    this.userSessions.set(userId, session);
    return isSuspicious;
  }

  getSession(userId: string): SessionData | undefined {
    return this.userSessions.get(userId);
  }

  clear(): void {
    this.userSessions.clear();
  }
}