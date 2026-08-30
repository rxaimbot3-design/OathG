/**
 * EmojiStickerProtection - Prevents emoji/sticker abuse.
 * Instance-based implementation for use with GuildContext.
 */

import type { SecurityModule } from "../core/interfaces/SecurityModule";

export class EmojiStickerProtectionInstance implements SecurityModule {
  readonly name = "emojiStickerProtection";
  private knownEmojis = new Map<string, { id: string; name: string; guildId: string }>();
  private knownStickers = new Map<string, { id: string; name: string; guildId: string }>();

  init(): void {
    // Nothing to initialize
  }

  trackEmoji(emoji: any, guildId: string): void {
    this.knownEmojis.set(emoji.id, { id: emoji.id, name: emoji.name, guildId });
  }

  trackSticker(sticker: any, guildId: string): void {
    this.knownStickers.set(sticker.id, { id: sticker.id, name: sticker.name, guildId });
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
    return Array.from(this.knownEmojis.entries())
      .filter(([, e]) => e.guildId === guildId)
      .map(([id, e]) => ({ id, name: e.name, guildId: e.guildId }));
  }

  getGuildStickers(guildId: string): Array<{ id: string; name: string; guildId: string }> {
    return Array.from(this.knownStickers.entries())
      .filter(([, s]) => s.guildId === guildId)
      .map(([id, s]) => ({ id, name: s.name, guildId: s.guildId }));
  }
}

/**
 * Global singleton instance (backwards compatibility).
 * @deprecated Use GuildContext.getEmojiStickerProtection() instead.
 */
export const EmojiStickerProtection = new EmojiStickerProtectionInstance();
