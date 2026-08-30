import { LruMap } from "../MapManager.js";

export interface EmojiStickerProtectionConfig {
  maxEmojis?: number;
  maxStickers?: number;
  suspiciousThreshold?: number;
}

export interface EmojiData {
  id: string;
  name: string;
  guildId: string;
}

export interface StickerData {
  id: string;
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
    this.knownEmojis.set(emoji.id, { id: emoji.id, name: emoji.name, guildId });
  }

  trackSticker(sticker: any, guildId: string): void {
    this.knownStickers.set(sticker.id, { id: sticker.id, name: sticker.name, guildId });
  }

  detectMassDeletion(guildId: string, deletedIds: string[]): boolean {
    if (deletedIds.length >= this.config.suspiciousThreshold) {
      console.warn(`[EMOJI-STICKER] Mass deletion detected in ${guildId}: ${deletedIds.length} items removed`);
      return true;
    }
    return false;
  }

  getGuildEmojis(guildId: string): EmojiData[] {
    const allEmojis = Array.from(this.knownEmojis.values()) as EmojiData[];
    return allEmojis.filter((e): e is EmojiData => e.guildId === guildId);
  }

  getGuildStickers(guildId: string): StickerData[] {
    const allStickers = Array.from(this.knownStickers.values()) as StickerData[];
    return allStickers.filter((s): s is StickerData => s.guildId === guildId);
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

  // Static wrapper methods for backward compatibility
  static trackEmoji(emoji: any, guildId: string): void {
    return this.getInstance().trackEmoji(emoji, guildId);
  }

  static trackSticker(sticker: any, guildId: string): void {
    return this.getInstance().trackSticker(sticker, guildId);
  }

  static detectMassDeletion(guildId: string, deletedIds: string[]): boolean {
    return this.getInstance().detectMassDeletion(guildId, deletedIds);
  }

  static getGuildEmojis(guildId: string): EmojiData[] {
    return this.getInstance().getGuildEmojis(guildId);
  }

  static getGuildStickers(guildId: string): StickerData[] {
    return this.getInstance().getGuildStickers(guildId);
  }

  static getEmojiCount(): number {
    return this.getInstance().getEmojiCount();
  }

  static getStickerCount(): number {
    return this.getInstance().getStickerCount();
  }

  static clear(): void {
    return this.getInstance().clear();
  }
}