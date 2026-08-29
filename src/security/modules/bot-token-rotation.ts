import { TokenVault } from "./token-vault.js";

export interface BotTokenRotationSystemConfig {
  reconnectHandler?: (token: string) => Promise<void> | void;
}

export class BotTokenRotationSystem {
  private static instance: BotTokenRotationSystem;
  private lastRotationTime: number;
  private reconnectHandler: ((token: string) => Promise<void> | void) | null;

  private constructor(config: BotTokenRotationSystemConfig = {}) {
    this.lastRotationTime = Date.now();
    this.reconnectHandler = config.reconnectHandler ?? null;
  }

  static getInstance(config?: BotTokenRotationSystemConfig): BotTokenRotationSystem {
    if (!BotTokenRotationSystem.instance) {
      BotTokenRotationSystem.instance = new BotTokenRotationSystem(config);
    }
    return BotTokenRotationSystem.instance;
  }

  static resetInstance(): void {
    BotTokenRotationSystem.instance = undefined as any;
  }

  setReconnectHandler(handler: (token: string) => Promise<void> | void): void {
    this.reconnectHandler = handler;
  }

  async rotateTokenInMemory(newToken: string): Promise<boolean> {
    if (!newToken || newToken.length < 50) return false;
    const cleanToken = newToken.trim();
    TokenVault.getInstance().store(cleanToken, "DISCORD_TOKEN");
    process.env.DISCORD_TOKEN = cleanToken;
    process.env.DISCORD_BOT_TOKEN = cleanToken;
    this.lastRotationTime = Date.now();
    console.log("[TOKEN-ROTATION] Bot token rotated and stored in encrypted vault.");

    if (this.reconnectHandler) {
      try {
        await this.reconnectHandler(cleanToken);
      } catch (err: any) {
        console.error("[TOKEN-ROTATION] Reconnect handler failed:", err.message);
      }
    }
    return true;
  }

  getLastRotationTime(): number {
    return this.lastRotationTime;
  }
}