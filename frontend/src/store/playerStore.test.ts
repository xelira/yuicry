import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audio", () => ({
  playTrack: vi.fn(),
  warmTrack: vi.fn(),
}));

import { playTrack } from "@/lib/audio";
import { usePlayer, type Track } from "./playerStore";

function track(id: string): Track {
  return {
    id,
    title: `track ${id}`,
    artist: "artist",
    duration: 180,
    cover_big: `https://cdn/cover-${id}.jpg`,
  };
}

function mockFetch(body: unknown) {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  });

  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
  usePlayer.setState(usePlayer.getInitialState(), true);
});

describe("playerStore", () => {
  it("начинает играть один трек", () => {
    const value = track("1");

    usePlayer.getState().play(value);

    const state = usePlayer.getState();
    expect(state.queue).toHaveLength(1);
    expect(state.index).toBe(0);
    expect(state.playing).toBe(true);
    expect(playTrack).toHaveBeenCalledWith("1");
  });

  it("убирает дубли из очереди и уважает стартовую позицию", () => {
    const queue = [track("1"), track("2"), track("1"), track("3")];

    usePlayer.getState().playQueue(queue, 2);

    const state = usePlayer.getState();
    expect(state.queue.map((item) => item.id)).toEqual(["1", "2", "3"]);
    expect(state.index).toBe(2);
    expect(state.playing).toBe(true);
  });

  it("не выходит за границы очереди", () => {
    usePlayer.getState().playQueue([track("1"), track("2")], 0);

    usePlayer.getState().previous();
    expect(usePlayer.getState().index).toBe(0);

    usePlayer.getState().next();
    usePlayer.getState().next();
    expect(usePlayer.getState().index).toBe(1);
  });

  it("переключает паузу", () => {
    usePlayer.getState().play(track("1"));

    usePlayer.getState().toggle();
    expect(usePlayer.getState().playing).toBe(false);

    usePlayer.getState().toggle();
    expect(usePlayer.getState().playing).toBe(true);
  });

  it("включает ведомый режим и сбрасывает его", () => {
    usePlayer.getState().follow(track("1"), 42);

    const following = usePlayer.getState();
    expect(following.following).toBe(true);
    expect(following.followSeek).toBeGreaterThanOrEqual(42);
    expect(following.queue).toHaveLength(1);

    usePlayer.getState().setFollowing(false);
    expect(usePlayer.getState().following).toBe(false);
    expect(usePlayer.getState().followSeek).toBe(0);
  });

  it("ставит и снимает лайк", async () => {
    const fetch = mockFetch({});
    const value = track("1");

    await usePlayer.getState().toggleLike(value);
    expect(usePlayer.getState().likes["1"]).toBe(true);
    expect(usePlayer.getState().liked).toHaveLength(1);

    const likeBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(likeBody.kind).toBe("like");

    await usePlayer.getState().toggleLike(value);
    expect(usePlayer.getState().likes["1"]).toBe(false);
    expect(usePlayer.getState().liked).toHaveLength(0);

    const unlikeBody = JSON.parse(fetch.mock.calls[1][1].body);
    expect(unlikeBody.kind).toBe("unlike");
  });

  it("дизлайк убирает трек и включает следующий", async () => {
    mockFetch({});
    usePlayer.getState().playQueue([track("1"), track("2")], 0);
    usePlayer.setState({ likes: { "1": true }, liked: [track("1")] });

    await usePlayer.getState().dislike(track("1"));

    const state = usePlayer.getState();
    expect(state.likes["1"]).toBeUndefined();
    expect(state.index).toBe(1);
    expect(state.playing).toBe(true);
  });

  it("дособирает волну, когда очередь кончается", async () => {
    const fetch = mockFetch({ tracks: [track("2"), track("3")] });
    usePlayer.getState().playQueue([track("1")], 0);

    await usePlayer.getState().ensureQueue();

    expect(fetch).toHaveBeenCalledWith("/api/wave");
    expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(["1", "2", "3"]);
  });

  it("не дособирает волну при большом запасе", async () => {
    const fetch = mockFetch({ tracks: [] });
    usePlayer.getState().playQueue([track("1"), track("2"), track("3"), track("4"), track("5")], 0);

    await usePlayer.getState().ensureQueue();

    expect(fetch).not.toHaveBeenCalled();
  });

  it("закрытие плеера выводит из режима текста", () => {
    usePlayer.getState().setFullscreen(true);
    usePlayer.getState().setLyricsOpen(true);

    expect(usePlayer.getState().lyricsOpen).toBe(true);

    usePlayer.getState().setFullscreen(false);

    expect(usePlayer.getState().fullscreen).toBe(false);
    expect(usePlayer.getState().lyricsOpen).toBe(false);
  });

  it("подтягивает избранное", async () => {
    mockFetch({ tracks: [track("1"), track("2")] });

    await usePlayer.getState().hydrate();

    const state = usePlayer.getState();
    expect(state.liked).toHaveLength(2);
    expect(state.likes["1"]).toBe(true);
    expect(state.likes["2"]).toBe(true);
  });
});
