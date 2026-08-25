/**
 * AIServiceMonitor - Tracks AI service health and quota status.
 * Provides visibility into AI degradation for operators.
 */

export enum AIServiceStatus {
  OPERATIONAL = "operational",
  DEGRADED = "degraded",
  QUOTA_EXHAUSTED = "quota_exhausted",
  ERROR = "error",
  DISABLED = "disabled"
}

export interface AIServiceHealth {
  status: AIServiceStatus;
  lastError?: string;
  lastErrorAt?: number;
  quotaExhaustedAt?: number;
  consecutiveFailures: number;
  totalCalls: number;
  failedCalls: number;
}

export class AIServiceMonitor {
  private static instance: AIServiceMonitor;
  private health: AIServiceHealth = {
    status: AIServiceStatus.DISABLED,
    consecutiveFailures: 0,
    totalCalls: 0,
    failedCalls: 0
  };
  private alertCallback?: (msg: string) => void;

  private constructor() {}

  static getInstance(): AIServiceMonitor {
    if (!AIServiceMonitor.instance) {
      AIServiceMonitor.instance = new AIServiceMonitor();
    }
    return AIServiceMonitor.instance;
  }

  setAlertCallback(callback: (msg: string) => void): void {
    this.alertCallback = callback;
  }

  recordCall(success: boolean, error?: string): void {
    this.health.totalCalls++;
    if (!success) {
      this.health.failedCalls++;
      this.health.consecutiveFailures++;

      const errorLower = error?.toLowerCase() || "";
      if (errorLower.includes("quota") || errorLower.includes("429") || errorLower.includes("resource_exhausted")) {
        this.health.status = AIServiceStatus.QUOTA_EXHAUSTED;
        this.health.quotaExhaustedAt = Date.now();
        this.health.lastError = error;
        this.health.lastErrorAt = Date.now();
        this.alertCallback?.(`🚨 [AI SERVICE] Gemini API quota exhausted! AI features are now operating in heuristic-only mode.`);
      } else if (this.health.consecutiveFailures >= 5) {
        this.health.status = AIServiceStatus.ERROR;
        this.health.lastError = error;
        this.health.lastErrorAt = Date.now();
        this.alertCallback?.(`⚠️ [AI SERVICE] Repeated AI failures detected (${this.health.consecutiveFailures} consecutive). Status: ERROR.`);
      } else {
        this.health.status = AIServiceStatus.DEGRADED;
        this.health.lastError = error;
        this.health.lastErrorAt = Date.now();
      }
    } else {
      this.health.consecutiveFailures = 0;
      if (this.health.status === AIServiceStatus.DEGRADED || this.health.status === AIServiceStatus.ERROR) {
        this.health.status = AIServiceStatus.OPERATIONAL;
        this.alertCallback?.(`✅ [AI SERVICE] Recovered to OPERATIONAL status.`);
      }
    }
  }

  getHealth(): AIServiceHealth {
    return { ...this.health };
  }

  isOperational(): boolean {
    return this.health.status === AIServiceStatus.OPERATIONAL;
  }

  isQuotaExhausted(): boolean {
    return this.health.status === AIServiceStatus.QUOTA_EXHAUSTED;
  }

  reset(): void {
    this.health = {
      status: AIServiceStatus.DISABLED,
      consecutiveFailures: 0,
      totalCalls: 0,
      failedCalls: 0
    };
  }
}

export const aiServiceMonitor = AIServiceMonitor.getInstance();
