"use client";

import { useEffect, useRef, useState } from "react";
import { AudioWaveform, Heart, Library, Search as SearchIcon } from "lucide-react";

import Albums from "@/components/Albums";
import { hostTheme } from "@/lib/host";
import MobileNav, { type Tab } from "@/components/MobileNav";
import Aurora from "@/components/Aurora";
import Likes from "@/components/Likes";
import NowPlaying from "@/components/NowPlaying";
import Player from "@/components/Player";
import Search from "@/components/Search";
import Wave from "@/components/Wave";
import { fallbackPalette, paletteFromCover, type Palette } from "@/lib/palette";
import { currentTrack, usePlayer } from "@/store/playerStore";

type Profile = {
  name: string;
  picture: string;
};

const tabs: { id: Tab; label: string; icon: typeof AudioWaveform }[] = [
  { id: "wave", label: "Моя волна", icon: AudioWaveform },
  { id: "search", label: "Поиск", icon: SearchIcon },
  { id: "likes", label: "Избранное", icon: Heart },
  { id: "albums", label: "Плейлисты", icon: Library },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("wave");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [palette, setPalette] = useState<Palette>(fallbackPalette);
  const track = usePlayer(currentTrack);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    setTheme(saved);
    hostTheme(saved);
  }, []);

  useEffect(() => {
    if (!track) return;

    let alive = true;
    paletteFromCover(track.cover_big).then((colors) => {
      if (alive) setPalette(colors);
    });

    return () => {
      alive = false;
    };
  }, [track?.id]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("yuicry-theme", next);
    hostTheme(next);
  };

  useEffect(() => {
    fetch("/api/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        setProfile(data);
        if (data) void usePlayer.getState().hydrate();
      })
      .catch(() => setProfile(null));
  }, []);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");

      if (typing) return;

      const player = usePlayer.getState();

      if (event.code === "Space") {
        event.preventDefault();
        player.toggle();
      }
      if (event.key === "ArrowRight") player.next();
      if (event.key === "ArrowLeft") player.previous();
      if (event.key === "/") {
        event.preventDefault();
        setTab("search");
        window.dispatchEvent(new Event("yuicry:focus-search"));
      }
    };

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login/";
  };

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden">
      <div className="fixed inset-0 z-0">
        <Aurora colors={palette} light={theme === "light"} />
        <div className="absolute inset-0" style={{ background: "var(--veil)" }} />
      </div>

      <header className="relative z-20 shrink-0 border-b border-line bg-bg pt-[var(--inset-top,0px)]">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-3 px-4 sm:px-6">
          <a href="/" className="text-[15px] font-semibold tracking-tight">
            yuicry<span className="text-accent">.</span>
          </a>

          <div className="flex-1" />

          {profile ? (
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen((value) => !value)}
                className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-2.5 hover:border-lineStrong"
              >
                {profile.picture ? (
                  <img
                    src={profile.picture}
                    alt=""
                    className="h-6 w-6 rounded-full border border-line object-cover"
                  />
                ) : (
                  <span className="h-6 w-6 rounded-full border border-line" />
                )}
                <span className="hidden max-w-[110px] truncate text-[12px] text-muted sm:block">
                  {profile.name}
                </span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full z-30 mt-2 w-44 rounded-lg border border-line bg-surface p-1.5 shadow-lift">
                  <p className="truncate px-2 py-1.5 text-[12px] text-muted">
                    {profile.name}
                  </p>
                  <button
                    onClick={toggleTheme}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-surface2"
                  >
                    <span>Тема</span>
                    <span className="text-muted">
                      {theme === "dark" ? "тёмная" : "светлая"}
                    </span>
                  </button>

                  <button
                    onClick={() => void logout()}
                    className="block w-full rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-surface2"
                  >
                    Выйти
                  </button>
                </div>
              )}
            </div>
          ) : (
            <a
              href="/api/auth/login"
              className="rounded-md border border-line px-3 py-1.5 text-[12px] hover:border-lineStrong"
            >
              Войти
            </a>
          )}
        </div>
      </header>

      <div className="relative z-10 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex max-w-[1520px] gap-6 px-3 pb-[calc(232px+var(--inset-bottom,0px))] sm:px-4 sm:pb-[140px]">
          <nav className="sticky top-0 hidden w-[250px] shrink-0 self-start pt-6 lg:block">
            <div className="rounded-2xl border border-line bg-bg p-2 shadow-lift">
            {tabs.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-[14px] transition-colors ${
                    active
                      ? "bg-surface2 text-ink"
                      : "text-muted hover:bg-surface2 hover:text-ink"
                  }`}
                >
                  <Icon size={19} strokeWidth={1.8} />
                  {item.label}
                </button>
              );
            })}
            </div>
          </nav>

          <main className="min-w-0 flex-1 pb-2 pt-6">
          <div className="min-w-0 flex-1">
            {tab === "wave" ? (
              <Wave />
            ) : tab === "search" ? (
              <Search />
            ) : tab === "likes" ? (
              <Likes />
            ) : (
              <Albums />
            )}
          </div>
          </main>
        </div>
      </div>

      <Player />
      <MobileNav tab={tab} onChange={setTab} compact={Boolean(track)} />
      <NowPlaying />
    </div>
  );
}
