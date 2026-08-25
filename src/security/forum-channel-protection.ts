/**
 * ForumChannelProtection - Guards forum configurations.
 * Instance-based implementation for use with GuildContext.
 */

import type { SecurityModule } from "../core/interfaces/SecurityModule";

export class ForumChannelProtectionInstance implements SecurityModule {
  readonly name = "forumChannelProtection";
  private protectedTags = new Map<string, { forumId: string; guildId: string; tagId: string }>();

  init(): void {
    // Nothing to initialize
  }

  trackForumTag(forumId: string, tagId: string, guildId: string): void {
    this.protectedTags.set(tagId, { forumId, guildId, tagId });
  }

  detectTagDeletion(tagId: string): boolean {
    const existed = this.protectedTags.has(tagId);
    this.protectedTags.delete(tagId);
    return existed;
  }

  detectMassTagChange(guildId: string, changeCount: number): boolean {
    if (changeCount >= 5) {
      console.warn(`[FORUM] Mass tag modification in ${guildId}: ${changeCount} changes`);
      return true;
    }
    return false;
  }
}

/**
 * Global singleton instance (backwards compatibility).
 * @deprecated Use GuildContext.getForumChannelProtection() instead.
 */
export const ForumChannelProtection = new ForumChannelProtectionInstance();
