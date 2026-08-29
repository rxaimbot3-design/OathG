import { LruMap } from "../MapManager.js";

export interface EmojiStickerProtectionConfig {
  maxEmojis?: number;
  maxStickers?: number;
  suspiciousThreshold?: number;
}

export interface EmojiData {
  name: string;
  guildId: string;
}

export interface StickerData {
  name: string;
  guildId: string;
}

export class EmojiStickerProtection {
  private static instance: EmojiStickerProtection;
  private knownEmojis: LruMap<string, EmojiData>;
  private knownStickers: LruMap<string, StickerData>;
  private config: Required<EmojiStickerProtectionConfig>;

  private constructor(config: EmojiStickerProtectionConfig = {}) {
    this.config = {
      maxEmojis: config.maxEmojis ?? 10000,
      maxStickers: config.maxStickers ?? 10000,
      suspiciousThreshold: config.suspiciousThreshold ?? 5,
    };
    this.knownEmojis = new LruMap<string, EmojiData>(this.config.maxEmojis);
    this.knownStickers = new LruMap<string, StickerData>(this.config.maxStickers);
  }

  static getInstance(config?: EmojiStickerProtectionConfig): EmojiStickerProtection {
    if (!EmojiStickerProtection.instance) {
      EmojiStickerProtection.instance = new EmojiStickerProtection(config);
    }
    return EmojiStickerProtection.instance;
  }

  static resetInstance(): void {
    EmojiStickerProtection.instance = undefined as any;
  }

  trackEmoji(emoji: any, guildId: string): void {
    this.knownEmojis.set(emoji.id, { name: emoji.name, guildId });
  }

  trackSticker(sticker: any, guildId: string): void {
    this.knownStickers.set(sticker.id, { name: sticker.name, guildId });
  }

  detectMassDeletion(guildId: string, deletedIds: string[]): boolean {
    if (deletedIds.length >= this.config.suspiciousThreshold) {
      console.warn(`[EMOJI-STICKER] Mass deletion detected in ${guildId}: ${deletedIds.length} items removed`);
      return true;
    }
    return false;
  }

  getGuildEmojis(guildId: string): EmojiData[] {
    return Array.from(this.knownEmojis.values()).filter(e => e.guildId === guildId);
  }

  getGuildStickers(guildId: string): StickerData[] {
    return Array.from(this.knownStickers.values()).filter(s => s.guildId === guildId);
  }

  getEmojiCount(): number {
    return this.knownEmojis.size;
  }

  getStickerCount(): number {
    return this.knownStickers.size;
  }

  clear(): void {
    this.knownEmojis.clear();
    this.knownStickers.clear();
  }
}