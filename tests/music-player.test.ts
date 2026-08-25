import { describe, it, expect, vi } from "vitest";
import { PlayDlMusicPlayer, MusicPlayerService } from "../src/bot/music-player";

describe("MusicPlayerService abstraction", () => {
  const player = new PlayDlMusicPlayer();

  it("returns null on play (deprecated backend)", async () => {
    const result = await player.play("123", "test query", "user123");
    expect(result).toBeNull();
  });

  it("returns empty queue", () => {
    const queue = player.getQueue("123");
    expect(queue).toEqual([]);
  });

  it("returns default state", () => {
    const state = player.getState("123");
    expect(state.isPlaying).toBe(false);
    expect(state.queue).toEqual([]);
    expect(state.volume).toBe(100);
    expect(state.loopMode).toBe("none");
  });

  it("stop does not throw", async () => {
    await expect(player.stop("123")).resolves.toBeUndefined();
  });

  it("skip returns null", async () => {
    const result = await player.skip("123");
    expect(result).toBeNull();
  });

  it("pause does not throw", async () => {
    await expect(player.pause("123")).resolves.toBeUndefined();
  });

  it("resume does not throw", async () => {
    await expect(player.resume("123")).resolves.toBeUndefined();
  });

  it("setVolume does not throw", async () => {
    await expect(player.setVolume("123", 50)).resolves.toBeUndefined();
  });

  it("setLoop does not throw", async () => {
    await expect(player.setLoop("123", "track")).resolves.toBeUndefined();
  });

  it("leave does not throw", async () => {
    await expect(player.leave("123")).resolves.toBeUndefined();
  });
});
