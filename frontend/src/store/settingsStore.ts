import { create } from "zustand";

export type SettingsPage = "root" | "appearance";

type SettingsState = {
  open: boolean;
  page: SettingsPage;
  show: () => void;
  hide: () => void;
  setPage: (page: SettingsPage) => void;
};

export const useSettings = create<SettingsState>((set) => ({
  open: false,
  page: "root",

  show: () => set({ open: true, page: "root" }),

  hide: () => set({ open: false, page: "root" }),

  setPage: (page) => set({ page }),
}));
