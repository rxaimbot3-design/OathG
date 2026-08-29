import { GuildMember } from "discord.js";
import { LruMap } from "../MapManager.js";

export interface GlobalIntelligenceConfig {
  maxThreats?: number;
}

export class GlobalIntelligence {
  private static instance: GlobalIntelligence;
  private knownThreats: LruMap<string, boolean>;
  private config: Required<GlobalIntelligenceConfig>;

  private constructor(config: GlobalIntelligenceConfig = {}) {
    this.config = {
      maxThreats: config.maxThreats ?? 10000,
    };
    this.knownThreats = new LruMap<string, boolean>(this.config.maxThreats);
  }

  static getInstance(config?: GlobalIntelligenceConfig): GlobalIntelligence {
    if (!GlobalIntelligence.instance) {
      GlobalIntelligence.instance = new GlobalIntelligence(config);
    }
    return GlobalIntelligence.instance;
  }

  static resetInstance(): void {
    GlobalIntelligence.instance = undefined as any;
  }

  flagUser(userId: string): void {
    this.knownThreats.set(userId, true);
    console.log(`[GLOBAL INTEL] User ${userId} flagged as a global threat.`);
  }

  unflagUser(userId: string): void {
    this.knownThreats.delete(userId);
  }

  isFlagged(userId: string): boolean {
    return this.knownThreats.has(userId);
  }

  async scanMember(member: GuildMember): Promise<boolean> {
    if (this.knownThreats.has(member.id)) {
      try {
        await member.ban({ reason: "Global Intelligence Network: Known Threat" });
        console.log(`🚨 [GLOBAL INTEL] Banned known threat ${member.user.tag} from ${member.guild.name}.`);
        return true;
      } catch (err: any) {
        console.error(`[GLOBAL INTEL] Failed to ban ${member.user.tag}:`, err.message);
        return false;
      }
    }
    return false;
  }

  getThreatCount(): number {
    return this.knownThreats.size;
  }

  getAllThreats(): string[] {
    return Array.from(this.knownThreats.keys());
  }

  clear(): void {
    this.knownThreats.clear();
  }
}