import { useEffect, useRef } from "react";

import { audioElement } from "@/lib/audio";
import { usePlayer } from "@/store/playerStore";

export function usePersistence() {
  const restoring = useRef(false);
  const pendingSeek = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("yuicry:playback");
      if (!raw) return;

      const saved = JSON.parse(raw);
      if (!saved?.queue?.length) return;

      const position = Math.min(Math.max(saved.index ?? 0, 0), saved.queue.length - 1);

      restoring.current = true;
      pendingSeek.current = saved.time ?? 0;

      usePlayer.setState({
        queue: saved.queue,
        index: position,
        rate: saved.rate ?? 1,
        volume: saved.volume ?? 0.9,
        repeat: saved.repeat ?? "off",
      });
    } catch (error) {
      pendingSeek.current = 0;
    }
  }, []);

  useEffect(() => {
    const audio = audioElement();
    let last = 0;

    const save = () => {
      const state = usePlayer.getState();
      if (state.index < 0 || state.queue.length === 0) return;

      try {
        localStorage.setItem(
          "yuicry:playback",
          JSON.stringify({
            queue: state.queue,
            index: state.index,
            time: audio.currentTime || 0,
            rate: state.rate,
            volume: state.volume,
            repeat: state.repeat,
          }),
        );
      } catch (error) {
        return;
      }
    };

    const onTime = () => {
      const now = Date.now();
      if (now - last > 2000) {
        last = now;
        save();
      }
    };

    audio.addEventListener("timeupdate", onTime);
    window.addEventListener("pagehide", save);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      window.removeEventListener("pagehide", save);
    };
  }, []);

  return { restoring, pendingSeek };
}
