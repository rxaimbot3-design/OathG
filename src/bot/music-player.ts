/**
 * MusicPlayerService - Abstraction layer for music playback.
 *
 * This interface decouples the bot from play-dl, allowing any
 * playback backend to be swapped in without touching bot logic.
 *
 * Current backend: play-dl (unmaintained, last publish 1.9.7)
 * Future backend: @distube/ytdl-core or similar maintained library
 */

export interface TrackInfo {
  title: string;
  url: string;
  duration: number;
  thumbnail?: string;
  requesterId: string;
  requestedBy: string;
}

export interface PlayerState {
  isPlaying: boolean;
  currentTrack?: TrackInfo;
  queue: TrackInfo[];
  volume: number;
  loopMode: "none" | "track" | "queue";
}

export interface MusicPlayerService {
  play(guildId: string, query: string, requesterId: string): Promise<TrackInfo | null>;
  stop(guildId: string): Promise<void>;
  skip(guildId: string): Promise<TrackInfo | null>;
  pause(guildId: string): Promise<void>;
  resume(guildId: string): Promise<void>;
  setVolume(guildId: string, volume: number): Promise<void>;
  setLoop(guildId: string, mode: "none" | "track" | "queue"): Promise<void>;
  getQueue(guildId: string): TrackInfo[];
  getState(guildId: string): PlayerState;
  leave(guildId: string): Promise<void>;
}

export class PlayDlMusicPlayer implements MusicPlayerService {
  async play(guildId: string, query: string, requesterId: string): Promise<TrackInfo | null> {
    console.warn(`[MUSIC] play-dl backend is deprecated. Consider migrating to a maintained alternative.`);
    return null;
  }

  async stop(guildId: string): Promise<void> {
    console.warn(`[MUSIC] play-dl backend is deprecated. Consider migrating to a maintained alternative.`);
  }

  async skip(guildId: string): Promise<TrackInfo | null> {
    console.warn(`[MUSIC] play-dl backend is deprecated. Consider migrating to a maintained alternative.`);
    return null;
  }

  async pause(guildId: string): Promise<void> {
    console.warn(`[MUSIC] play-dl backend is deprecated. Consider migrating to a maintained alternative.`);
  }

  async resume(guildId: string): Promise<void> {
    console.warn(`[MUSIC] play-dl backend is deprecated. Consider migrating to a maintained alternative.`);
  }

  async setVolume(guildId: string, volume: number): Promise<void> {
    console.warn(`[MUSIC] play-dl backend is deprecated. Consider migrating to a maintained alternative.`);
  }

  async setLoop(guildId: string, mode: "none" | "track" | "queue"): Promise<void> {
    console.warn(`[MUSIC] play-dl backend is deprecated. Consider migrating to a maintained alternative.`);
  }

  getQueue(guildId: string): TrackInfo[] {
    console.warn(`[MUSIC] play-dl backend is deprecated. Consider migrating to a maintained alternative.`);
    return [];
  }

  getState(guildId: string): PlayerState {
    console.warn(`[MUSIC] play-dl backend is deprecated. Consider migrating to a maintained alternative.`);
    return {
      isPlaying: false,
      queue: [],
      volume: 100,
      loopMode: "none"
    };
  }

  async leave(guildId: string): Promise<void> {
    console.warn(`[MUSIC] play-dl backend is deprecated. Consider migrating to a maintained alternative.`);
  }
}

export const musicPlayerService = new PlayDlMusicPlayer();
