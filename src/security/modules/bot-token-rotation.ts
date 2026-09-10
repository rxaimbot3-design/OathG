import { TokenVault } from "./token-vault.js";

/**
 * Bot Token Rotation System
 * 
 * IMPORTANT LIMITATION: This system CANNOT rotate the actual Discord application token.
 * Discord tokens are managed exclusively through the Discord Developer Portal.
 * 
 * What this system DOES:
 * - Updates the token stored in the encrypted TokenVault
 * - Updates process environment variables (DISCORD_TOKEN, DISCORD_BOT_TOKEN)
 * - Invokes a reconnect handler to restart the bot with the new token
 * 
 * What this system CANNOT do:
 * - Generate new Discord tokens (must be done manually in Developer Portal)
 * - Revoke old tokens on Discord's side
 * - Rotate tokens without a bot restart/reconnect
 * 
 * For true token rotation, you must:
 * 1. Generate a new token in the Discord Developer Portal
 * 2. Revoke the old token in the Discord Developer Portal
 * 3. Use this system to update the bot with the new token
 */

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

  // Static wrapper methods for backward compatibility
  static setReconnectHandler(handler: (token: string) => Promise<void> | void): void {
    return this.getInstance().setReconnectHandler(handler);
  }

  static async rotateTokenInMemory(newToken: string): Promise<boolean> {
    return this.getInstance().rotateTokenInMemory(newToken);
  }

  static getLastRotationTime(): number {
    return this.getInstance().getLastRotationTime();
  }
}