"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { audioElement } from "@/lib/audio";
import { hostSeek } from "@/lib/host";
import { currentTrack, usePlayer } from "@/store/playerStore";

import DesktopControls from "./player/DesktopControls";
import MobileControls from "./player/MobileControls";
import PlayerNotice from "./player/PlayerNotice";
import SeekBar from "./player/SeekBar";
import { useAudioEngine } from "./player/useAudioEngine";
import { usePersistence } from "./player/usePersistence";
import { usePlaybackSync } from "./player/usePlaybackSync";

export default function Player() {
  const track = usePlayer(currentTrack);
  const playing = usePlayer((state) => state.playing);
  const following = usePlayer((state) => state.following);
  const setFollowing = usePlayer((state) => state.setFollowing);

  const { restoring, pendingSeek } = usePersistence();

  const [notice, setNotice] = useState("");
  const failures = useRef(0);

  const handleLoaded = useCallback(() => {
    failures.current = 0;
  }, []);

  const handleFailure = useCallback(() => {
    failures.current += 1;

    if (failures.current >= 4) {
      usePlayer.getState().setPlaying(false);
      setNotice("Не удалось загрузить треки. Проверь соединение.");
      return;
    }

    const state = usePlayer.getState();

    if (state.index + 1 < state.queue.length) {
      setNotice("Трек недоступен, включаю следующий");
      state.next();
      void state.ensureQueue();
      return;
    }

    state.setPlaying(false);
    setNotice("Трек недоступен");
  }, []);

  const { time, duration, buffering, seekTo } = useAudioEngine(track, {
    restoring,
    pendingSeek,
    onFailure: handleFailure,
    onLoaded: handleLoaded,
  });

  usePlaybackSync(track, { seekTo });

  useEffect(() => {
    if (!notice) return;

    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    document.title = track ? `${track.title} — ${track.artist}` : "yuicry";
  }, [track?.id]);

  useEffect(() => {
    return () => {
      document.title = "yuicry";
    };
  }, []);

  if (!track) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(46px+var(--inset-bottom,0px))] z-30 overflow-hidden rounded-t-2xl border-x border-t border-line bg-surface shadow-[0_-10px_30px_rgba(0,0,0,0.18)] sm:bottom-0 sm:rounded-none sm:border-x-0">
      <PlayerNotice message={notice} />

      {following && (
        <div className="mx-auto flex max-w-[1280px] justify-center px-4 pt-2">
          <button
            onClick={() => setFollowing(false)}
            className="flex items-center gap-2 rounded-full border border-line bg-surface2 px-3 py-1 text-[11px] text-muted transition-colors hover:text-ink"
          >
            Звук выключен на этом устройстве · включить
          </button>
        </div>
      )}

      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <SeekBar
          time={time}
          duration={duration}
          onSeek={seekTo}
          onSeekEnd={() => hostSeek(audioElement().currentTime || 0)}
          labels
        />

        <MobileControls track={track} playing={playing} buffering={buffering} />

        <DesktopControls
          track={track}
          playing={playing}
          buffering={buffering}
          time={time}
          duration={duration}
        />
      </div>
    </div>
  );
}
