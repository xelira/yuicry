"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

import { useNav } from "@/store/navStore";
import { usePlayer } from "@/store/playerStore";
import { useSettings } from "@/store/settingsStore";

export default function BackHandler() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listener = App.addListener("backButton", () => {
      const player = usePlayer.getState();

      if (player.fullscreen) {
        if (player.lyricsOpen) {
          player.setLyricsOpen(false);
          return;
        }

        player.setFullscreen(false);
        return;
      }

      const settings = useSettings.getState();

      if (settings.open) {
        settings.hide();
        return;
      }

      const nav = useNav.getState();

      if (nav.catalog) {
        nav.closeCatalog();
        return;
      }

      if (Capacitor.getPlatform() === "android") {
        void App.minimizeApp();
      }
    });

    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, []);

  return null;
}
