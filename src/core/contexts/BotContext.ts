/**
 * BotContext - Global singleton container for bot-wide state.
 * Replaces scattered global variables and static class singletons.
 */

import type { Client } from "discord.js";

export interface BotContext {
  readonly client: Client | null;
  readonly geminiApiKey: string | undefined;
  readonly adminSecret: string | undefined;
  readonly ownerIds: Set<string>;
  readonly isPanicLockdownActive: boolean;
  readonly startTime: number;

  setClient(client: Client): void;
  setPanicLockdown(active: boolean): void;
  registerOwner(userId: string): void;
  unregisterOwner(userId: string): void;
  isOwner(userId: string, guildOwnerId?: string): boolean;
}

export class DefaultBotContext implements BotContext {
  private _client: Client | null = null;
  private _panicLockdown = false;
  private _ownerIds = new Set<string>();
  private _startTime = Date.now();

  get client(): Client | null { return this._client; }
  get geminiApiKey(): string | undefined { return process.env.GEMINI_API_KEY; }
  get adminSecret(): string | undefined { return process.env.ADMIN_SECRET; }
  get ownerIds(): Set<string> { return this._ownerIds; }
  get isPanicLockdownActive(): boolean { return this._panicLockdown; }
  get startTime(): number { return this._startTime; }

  setClient(client: Client): void {
    this._client = client;
  }

  setPanicLockdown(active: boolean): void {
    this._panicLockdown = active;
  }

  registerOwner(userId: string): void {
    if (userId) this._ownerIds.add(userId);
  }

  unregisterOwner(userId: string): void {
    this._ownerIds.delete(userId);
  }

  isOwner(userId: string, guildOwnerId?: string): boolean {
    if (!userId) return false;
    if (guildOwnerId && userId === guildOwnerId) return true;
    return this._ownerIds.has(userId);
  }
}

// Global singleton instance (created at startup)
export const botContext = new DefaultBotContext();
