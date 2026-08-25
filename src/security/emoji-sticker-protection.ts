/**
 * EmojiStickerProtection - Prevents emoji/sticker abuse.
 * Instance-based implementation for use with GuildContext.
 */

import type { SecurityModule } from "../core/interfaces/SecurityModule";

export class EmojiStickerProtectionInstance implements SecurityModule {
  readonly name = "emojiStickerProtection";
  private knownEmojis = new Map<string, { name: string; guildId: string }>();
  private knownStickers = new Map<string, { name: string; guildId: string }>();

  init(): void {
    // Nothing to initialize
  }

  trackEmoji(emoji: any, guildId: string): void {
    this.knownEmojis.set(emoji.id, { name: emoji.name, guildId });
  }

  trackSticker(sticker: any, guildId: string): void {
    this.knownStickers.set(sticker.id, { name: sticker.name, guildId });
  }

  detectMassDeletion(guildId: string, deletedIds: string[]): boolean {
    const suspiciousThreshold = 5;
    if (deletedIds.length >= suspiciousThreshold) {
      console.warn(`[EMOJI-STICKER] Mass deletion detected in ${guildId}: ${deletedIds.length} items removed`);
      return true;
    }
    return false;
  }

  getGuildEmojis(guildId: string): Array<{ id: string; name: string; guildId: string }> {
    return Array.from(this.knownEmojis.values()).filter(e => e.guildId === guildId);
  }

  getGuildStickers(guildId: string): Array<{ id: string; name: string; guildId: string }> {
    return Array.from(this.knownStickers.values()).filter(s => s.guildId === guildId);
  }
}

/**
 * Global singleton instance (backwards compatibility).
 * @deprecated Use GuildContext.getEmojiStickerProtection() instead.
 */
export const EmojiStickerProtection = new EmojiStickerProtectionInstance();
