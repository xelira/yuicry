import { create } from "zustand";

import { usePlayer } from "@/store/playerStore";
import { useSettings } from "@/store/settingsStore";

export type CatalogTarget = {
  kind: "artist" | "album";
  id: string;
} | null;

type NavState = {
  catalog: CatalogTarget;
  openArtist: (id: string) => void;
  openAlbum: (id: string) => void;
  closeCatalog: () => void;
};

function persist(catalog: CatalogTarget) {
  if (typeof window === "undefined") return;

  try {
    if (catalog) {
      localStorage.setItem("yuicry:catalog", JSON.stringify(catalog));
    } else {
      localStorage.removeItem("yuicry:catalog");
    }
  } catch (error) {
    return;
  }
}

export const useNav = create<NavState>((set) => ({
  catalog: null,

  openArtist: (id) => {
    const catalog = { kind: "artist" as const, id };
    usePlayer.getState().setFullscreen(false);
    useSettings.getState().hide();
    persist(catalog);
    set({ catalog });
  },

  openAlbum: (id) => {
    const catalog = { kind: "album" as const, id };
    usePlayer.getState().setFullscreen(false);
    useSettings.getState().hide();
    persist(catalog);
    set({ catalog });
  },

  closeCatalog: () => {
    persist(null);
    set({ catalog: null });
  },
}));
