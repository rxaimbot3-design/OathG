import { LruMap } from "../MapManager.js";

export interface ForumChannelProtectionConfig {
  maxTags?: number;
  suspiciousThreshold?: number;
}

export interface ForumTagData {
  forumId: string;
  guildId: string;
  tagId: string;
}

export class ForumChannelProtection {
  private static instance: ForumChannelProtection;
  private protectedTags: LruMap<string, ForumTagData>;
  private config: Required<ForumChannelProtectionConfig>;

  private constructor(config: ForumChannelProtectionConfig = {}) {
    this.config = {
      maxTags: config.maxTags ?? 10000,
      suspiciousThreshold: config.suspiciousThreshold ?? 5,
    };
    this.protectedTags = new LruMap<string, ForumTagData>(this.config.maxTags);
  }

  static getInstance(config?: ForumChannelProtectionConfig): ForumChannelProtection {
    if (!ForumChannelProtection.instance) {
      ForumChannelProtection.instance = new ForumChannelProtection(config);
    }
    return ForumChannelProtection.instance;
  }

  static resetInstance(): void {
    ForumChannelProtection.instance = undefined as any;
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
    if (changeCount >= this.config.suspiciousThreshold) {
      console.warn(`[FORUM] Mass tag modification in ${guildId}: ${changeCount} changes`);
      return true;
    }
    return false;
  }

  getTagCount(): number {
    return this.protectedTags.size;
  }

  clear(): void {
    this.protectedTags.clear();
  }
}