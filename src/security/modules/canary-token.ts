import crypto from "crypto";
import { LruMap } from "../MapManager.js";

export interface CanaryTokenConfig {
  adminSecret?: string;
  canaryToken?: string;
  maxConsumedTokens?: number;
}

export interface SignedTokenPayload {
  guildId: string;
  trapName: string;
  userId?: string;
  timestamp: number;
  nonce: string;
}

export interface VerifiedTokenResult {
  valid: boolean;
  guildId?: string;
  trapName?: string;
  userId?: string;
}

export class CanaryToken {
  private static instance: CanaryToken;
  private processFallbackSecret: string;
  private consumedTokens: LruMap<string, boolean>;
  private config: CanaryTokenConfig;

  private constructor(config: CanaryTokenConfig = {}) {
    this.config = config;
    this.processFallbackSecret = crypto.randomBytes(32).toString("hex");
    this.consumedTokens = new LruMap<string, boolean>(config.maxConsumedTokens ?? 10000);
  }

  static getInstance(config?: CanaryTokenConfig): CanaryToken {
    if (!CanaryToken.instance) {
      CanaryToken.instance = new CanaryToken(config);
    }
    return CanaryToken.instance;
  }

  static resetInstance(): void {
    CanaryToken.instance = undefined as any;
  }

  setup(): void {
    if (!process.env.CANARY_TOKEN) {
      process.env.CANARY_TOKEN = `canary_${crypto.randomBytes(24).toString("hex")}`;
    }
  }

  private getSecret(): string {
    return this.config.adminSecret || process.env.ADMIN_SECRET || process.env.CANARY_TOKEN || this.processFallbackSecret;
  }

  check(token: string): boolean {
    const canary = process.env.CANARY_TOKEN;
    if (!canary) return false;
    const cleanToken = (token || "").trim();
    if (cleanToken.length !== canary.length) return false;
    return crypto.timingSafeEqual(Buffer.from(cleanToken), Buffer.from(canary));
  }

  generateSignedToken(guildId: string, trapName: string, userId?: string): string {
    const secret = this.getSecret();
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(8).toString("hex");
    const payload: SignedTokenPayload = { guildId, trapName, userId: userId || "any", timestamp, nonce };
    const hmac = crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
    return `${Buffer.from(JSON.stringify(payload)).toString("base64")}.${hmac}`;
  }

  verifySignedToken(tokenStr: string): VerifiedTokenResult {
    try {
      if (!tokenStr) return { valid: false };
      const secret = this.getSecret();
      const [b64Payload, sig] = tokenStr.split(".");
      if (!b64Payload || !sig) return { valid: false };

      if (this.consumedTokens.has(sig)) {
        return { valid: false }; // Replay attack prevention
      }

      const payloadStr = Buffer.from(b64Payload, "base64").toString("utf8");
      const computedHmac = crypto.createHmac("sha256", secret).update(payloadStr).digest("hex");
      if (sig.length !== computedHmac.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(computedHmac))) {
        return { valid: false };
      }

      const payload = JSON.parse(payloadStr) as SignedTokenPayload;
      const now = Date.now();
      // Reject if timestamp is in the future (> 1 min clock skew margin) or older than 24 hours
      if (payload.timestamp > now + 60000 || now - payload.timestamp > 86400000) {
        return { valid: false };
      }

      this.consumedTokens.set(sig, true);

      return { 
        valid: true, 
        guildId: payload.guildId, 
        trapName: payload.trapName, 
        userId: payload.userId !== "any" ? payload.userId : undefined 
      };
    } catch {
      return { valid: false };
    }
  }

  getConsumedCount(): number {
    return this.consumedTokens.size;
  }

  clearConsumed(): void {
    this.consumedTokens.clear();
  }
}