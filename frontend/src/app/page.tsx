"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { AudioWaveform, Heart, Library, Search as SearchIcon } from "lucide-react";

import Albums from "@/components/Albums";
import Assistant from "@/components/Assistant";
import AssistantIcon from "@/components/AssistantIcon";
import Background from "@/components/Background";
import CatalogView from "@/components/CatalogView";
import DragOverlay from "@/components/DragOverlay";
import { avatarSource } from "@/lib/avatar";
import { hostTheme } from "@/lib/host";
import { checkUpdate, type AppUpdate } from "@/lib/update";
import MobileNav, { type Tab } from "@/components/MobileNav";
import Likes from "@/components/Likes";
import NowPlaying from "@/components/NowPlaying";
import Player from "@/components/Player";
import Search from "@/components/Search";
import Settings from "@/components/settings/Settings";
import SimilarSheet from "@/components/SimilarSheet";
import Wave from "@/components/Wave";
import { applyAccent, readAccent } from "@/lib/color";
import { applyAuroraTone, fallbackPalette, paletteFromCover, type Palette } from "@/lib/palette";
import { useNav } from "@/store/navStore";
import { currentTrack, usePlayer } from "@/store/playerStore";
import { useAppearance } from "@/store/appearanceStore";
import { useAssistant } from "@/store/assistantStore";
import { useSettings } from "@/store/settingsStore";

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
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [update, setUpdate] = useState<AppUpdate | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const catalog = useNav((state) => state.catalog);
  const closeCatalog = useNav((state) => state.closeCatalog);
  const settingsOpen = useSettings((state) => state.open);
  const background = useAppearance((state) => state.background);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef<Record<string, number>>({});
  const viewKey = catalog ? `${catalog.kind}-${catalog.id}` : settingsOpen ? "settings" : tab;
  const viewKeyRef = useRef(viewKey);
  const [palette, setPalette] = useState<Palette>(fallbackPalette);
  const track = usePlayer(currentTrack);

  useEffect(() => {
    document.documentElement.dataset.background = background;
  }, [background]);

  useEffect(() => {
    const saved = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    setTheme(saved);
    hostTheme(saved);

    const accent = readAccent();
    if (accent) applyAccent(accent);
  }, []);

  useEffect(() => {
    void checkUpdate().then(setUpdate);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const playlist = params.get("playlist");
    const trackId = params.get("track");
    const deepLink = Boolean(playlist || trackId);

    if (playlist) {
      setTab("albums");
    }

    if (!deepLink) {
      try {
        const savedTab = localStorage.getItem("yuicry:tab");
        if (
          savedTab === "wave" ||
          savedTab === "search" ||
          savedTab === "likes" ||
          savedTab === "albums"
        ) {
          setTab(savedTab);
        }

        const savedCatalog = localStorage.getItem("yuicry:catalog");
        if (savedCatalog) {
          const parsed = JSON.parse(savedCatalog);
          if (parsed?.id && parsed.kind === "artist") {
            useNav.getState().openArtist(parsed.id);
          } else if (parsed?.id && parsed.kind === "album") {
            useNav.getState().openAlbum(parsed.id);
          }
        }
      } catch (error) {
        setReady(true);
      }
    }

    setReady(true);

    if (!trackId) return;

    let alive = true;

    fetch(`/api/track/${trackId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((track) => {
        if (alive && track?.id) usePlayer.getState().play(track);
      })
      .catch(() => undefined);

    window.history.replaceState({}, "", "/");

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;

    try {
      localStorage.setItem("yuicry:tab", tab);
    } catch (error) {
      return;
    }
  }, [tab, ready]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let alive = true;

    const open = (value: string) => {
      try {
        const path = new URL(value).pathname;

        if (path.startsWith("/t/")) {
          window.location.replace(`/?track=${path.slice(3)}`);
        } else if (path.startsWith("/p/")) {
          window.location.replace(`/?playlist=${path.slice(3)}`);
        }
      } catch (error) {
        return;
      }
    };

    void App.getLaunchUrl().then((launch) => {
      if (alive && launch?.url) open(launch.url);
    });

    const listener = App.addListener("appUrlOpen", ({ url }) => open(url));

    return () => {
      alive = false;
      void listener.then((handle) => handle.remove());
    };
  }, []);

  useEffect(() => {
    setAvatarFailed(false);
  }, [profile?.picture]);

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

  useEffect(() => {
    applyAuroraTone(palette);
  }, [palette, theme]);

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

  useLayoutEffect(() => {
    viewKeyRef.current = viewKey;

    const scroller = scrollRef.current;
    if (scroller) scroller.scrollTop = scrollPositions.current[viewKey] ?? 0;
  }, [viewKey]);

  const rememberScroll = () => {
    const scroller = scrollRef.current;
    if (scroller) scrollPositions.current[viewKeyRef.current] = scroller.scrollTop;
  };

  const selectTab = (next: Tab) => {
    useSettings.getState().hide();
    closeCatalog();
    setTab(next);
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login/";
  };

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden">
      <div className="fixed inset-0 z-0">
        <Background colors={palette} light={theme === "light"} />
        <div className="absolute inset-0" style={{ background: "var(--veil)" }} />
      </div>

      <header className="relative z-20 shrink-0 border-b border-line bg-bg/85 backdrop-blur-xl pt-[var(--inset-top,0px)]">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-3 px-4 sm:px-6">
          <button
            onClick={() => selectTab("wave")}
            className="text-[15px] font-semibold tracking-tight"
            aria-label="Моя волна"
          >
            yuicry<span className="text-accent">.</span>
          </button>

          <div className="flex-1" />

          <button
            onClick={() => {
              const assistant = useAssistant.getState();
              assistant.setExpanded(false);
              assistant.setOpen(true);
            }}
            aria-label="Ассистент"
            className="flex h-9 items-center gap-2 rounded-full border border-line px-2.5 text-[12px] text-muted transition-colors hover:border-lineStrong hover:text-ink sm:px-3"
          >
            <AssistantIcon size={17} />
            <span className="hidden sm:block">Ассистент</span>
          </button>

          {profile ? (
            <button
              onClick={() => {
                closeCatalog();
                useSettings.getState().show();
              }}
              className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-2.5 transition-colors hover:border-lineStrong"
              aria-label="Настройки"
            >
              <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-line bg-surface2 text-[10px] font-medium uppercase text-muted">
                {profile.picture && !avatarFailed ? (
                  <img
                    src={avatarSource(profile.picture)}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => setAvatarFailed(true)}
                  />
                ) : (
                  profile.name.slice(0, 1)
                )}
              </span>
              <span className="hidden max-w-[110px] truncate text-[12px] text-muted sm:block">
                {profile.name}
              </span>
            </button>
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

      {update && (
        <div className="relative z-20 flex shrink-0 items-center justify-center gap-3 bg-accent px-4 py-2 text-[12px] text-accentText">
          <span>Доступна версия {update.version}</span>
          <a href={update.url} target="_blank" rel="noreferrer" className="font-medium underline">
            Скачать
          </a>
          <button
            onClick={() => {
              localStorage.setItem("yuicry:update-dismissed", update.version);
              setUpdate(null);
            }}
            className="absolute right-3 flex h-6 w-6 items-center justify-center"
            aria-label="Скрыть"
          >
            ×
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={rememberScroll}
        className="relative z-10 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto flex max-w-[1520px] gap-6 px-3 pb-[calc(232px+var(--inset-bottom,0px))] sm:px-4 sm:pb-[140px]">
          <nav className="sticky top-0 hidden w-[250px] shrink-0 self-start pt-6 lg:block">
            <div className="rounded-2xl border border-line bg-bg p-2 shadow-lift">
            {tabs.map((item) => {
              const Icon = item.icon;
              const active = !catalog && !settingsOpen && tab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => selectTab(item.id)}
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
              <div className={catalog || settingsOpen ? "hidden" : "block"}>
                <div
                  data-tab="wave"
                  className={
                    !catalog && !settingsOpen && tab === "wave"
                      ? "animate-[fade-up_.5s_cubic-bezier(.22,1,.36,1)]"
                      : "hidden"
                  }
                >
                  <Wave palette={palette} />
                </div>

                <div
                  data-tab="search"
                  className={
                    !catalog && !settingsOpen && tab === "search"
                      ? "animate-[fade-up_.5s_cubic-bezier(.22,1,.36,1)]"
                      : "hidden"
                  }
                >
                  <Search />
                </div>

                <div
                  data-tab="likes"
                  className={
                    !catalog && !settingsOpen && tab === "likes"
                      ? "animate-[fade-up_.5s_cubic-bezier(.22,1,.36,1)]"
                      : "hidden"
                  }
                >
                  <Likes onExplore={() => selectTab("wave")} />
                </div>

                <div
                  data-tab="albums"
                  className={
                    !catalog && !settingsOpen && tab === "albums"
                      ? "animate-[fade-up_.5s_cubic-bezier(.22,1,.36,1)]"
                      : "hidden"
                  }
                >
                  <Albums onExplore={() => selectTab("search")} />
                </div>
              </div>

              {catalog && (
                <div
                  key={`${catalog.kind}-${catalog.id}`}
                  className="animate-[fade-up_.5s_cubic-bezier(.22,1,.36,1)]"
                >
                  <CatalogView />
                </div>
              )}

              {settingsOpen && (
                <div
                  key="settings"
                  className="animate-[fade-up_.5s_cubic-bezier(.22,1,.36,1)]"
                >
                  <Settings
                    profile={profile}
                    theme={theme}
                    onToggleTheme={toggleTheme}
                    onLogout={() => void logout()}
                  />
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      <Player />
      <MobileNav tab={settingsOpen ? null : tab} onChange={selectTab} compact={Boolean(track)} />
      <NowPlaying />
      <Assistant />
      <SimilarSheet />
      <DragOverlay />
    </div>
  );
}
