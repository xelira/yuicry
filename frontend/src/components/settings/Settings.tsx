"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Heart,
  Layers,
  LogOut,
  Moon,
  Palette,
  Play,
  Settings as SettingsIcon,
  Sun,
} from "lucide-react";

import AccentPicker from "@/components/settings/AccentPicker";
import { avatarSource } from "@/lib/avatar";
import { useAccentColor } from "@/lib/useAccentColor";
import { backgrounds, useAppearance, type BackgroundId } from "@/store/appearanceStore";
import { useSettings } from "@/store/settingsStore";

type Profile = {
  name: string;
  picture: string;
};

type Props = {
  profile: Profile | null;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onLogout: () => void;
};

function preview(id: BackgroundId): CSSProperties {
  if (id === "contour") {
    return {
      background:
        "repeating-radial-gradient(ellipse 120% 90% at 25% 45%, transparent 0 5px, rgb(var(--text-rgb) / 0.16) 6px 7px, transparent 8px 13px), repeating-radial-gradient(ellipse 90% 120% at 78% 62%, transparent 0 6px, rgb(var(--accent-rgb) / 0.2) 7px 8px, transparent 9px 15px), var(--bg)",
    };
  }

  if (id === "moire") {
    return {
      background:
        "repeating-radial-gradient(circle at 32% 50%, transparent 0 5px, rgb(var(--text-rgb) / 0.18) 6px 7px, transparent 8px 12px), repeating-radial-gradient(circle at 68% 50%, transparent 0 5px, rgb(var(--accent-rgb) / 0.18) 6px 7px, transparent 8px 12px), var(--bg)",
    };
  }

  if (id === "halftone") {
    return {
      backgroundColor: "var(--bg)",
      backgroundImage:
        "radial-gradient(circle, rgb(var(--text-rgb) / 0.42) 1.1px, transparent 1.4px), radial-gradient(circle at 70% 30%, rgb(var(--accent-rgb) / 0.35), transparent 45%)",
      backgroundSize: "9px 9px, 100% 100%",
    };
  }

  if (id === "blueprint") {
    return {
      background:
        "radial-gradient(circle at 50% 50%, transparent 0 26%, rgb(var(--text-rgb) / 0.22) 27% 28%, transparent 29% 37%, rgb(var(--text-rgb) / 0.12) 38% 39%, transparent 40%), linear-gradient(90deg, transparent 49.5%, rgb(var(--text-rgb) / 0.18) 50%, transparent 50.5%), linear-gradient(0deg, transparent 49.5%, rgb(var(--text-rgb) / 0.18) 50%, transparent 50.5%), conic-gradient(from 20deg at 50% 50%, transparent 0 40deg, rgb(var(--accent-rgb) / 0.5) 40deg 55deg, transparent 55deg 360deg), var(--bg)",
    };
  }

  if (id === "weave") {
    return {
      background:
        "repeating-linear-gradient(45deg, transparent 0 5px, rgb(var(--text-rgb) / 0.12) 6px 7px), repeating-linear-gradient(-45deg, transparent 0 5px, rgb(var(--accent-rgb) / 0.12) 6px 7px), var(--bg)",
    };
  }

  return {
    background:
      "radial-gradient(120% 120% at 20% 0%, var(--accent) 0%, transparent 55%), radial-gradient(100% 100% at 90% 100%, #6a5cff 0%, transparent 55%), var(--bg)",
  };
}

export default function Settings({ profile, theme, onToggleTheme, onLogout }: Props) {
  const page = useSettings((state) => state.page);
  const setPage = useSettings((state) => state.setPage);
  const hide = useSettings((state) => state.hide);
  const background = useAppearance((state) => state.background);
  const setBackground = useAppearance((state) => state.setBackground);
  const current = backgrounds.find((item) => item.id === background) ?? backgrounds[0];
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const accent = useAccentColor();

  if (page === "appearance") {
    return (
      <section className="mx-auto w-full max-w-[760px] pt-4">
        <div key="appearance" className="animate-[fade-up_.45s_cubic-bezier(.22,1,.36,1)]">
          <div className="aurora-text">
            <button
              onClick={() => setPage("root")}
              className="flex items-center gap-1.5 text-[12px] text-muted hover:text-ink"
            >
              <ArrowLeft size={14} />
              Настройки
            </button>
          </div>

          <h1 className="aurora-text mt-4 text-[28px] font-semibold tracking-tight">Оформление</h1>
          <p className="aurora-text mt-1 text-[13px] text-muted">
            Настрой внешний вид под себя.
          </p>

          <div className="relative mt-4 overflow-hidden rounded-[28px] border border-line shadow-lift">
            <div className="absolute inset-0" style={preview(background)} />
            <div className="relative p-4 sm:p-5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-[10px] font-medium text-white/85 backdrop-blur-md">
                Предпросмотр
              </span>

              <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/35 p-3 backdrop-blur-md">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accentText shadow-lg">
                  <Play size={16} fill="currentColor" className="ml-0.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-white">Твой стиль</p>
                  <p className="truncate text-[11px] text-white/60">
                    {current.name} · {theme === "dark" ? "тёмная тема" : "светлая тема"}
                  </p>
                </div>
                <Heart size={18} fill="currentColor" className="text-accent" />
              </div>

              <div className="mt-3 h-1.5 rounded-full bg-white/20">
                <div className="h-full w-2/3 rounded-full bg-accent" />
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-[28px] border border-line bg-bg/85 p-4 shadow-lift backdrop-blur-xl sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface2 text-accent">
                <Palette size={17} />
              </span>
              <div>
                <h2 className="text-[15px] font-medium tracking-tight">Акцентный цвет</h2>
                <p className="mt-0.5 text-[12px] text-muted">
                  Цвет кнопок, сердца и активных элементов.
                </p>
              </div>
            </div>

            <button
              onClick={() => setPickerOpen((value) => !value)}
              aria-expanded={pickerOpen}
              className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-line bg-surface2/60 p-3 text-left transition-colors hover:border-lineStrong"
            >
              <span
                className="h-9 w-9 shrink-0 rounded-full border border-white/20 shadow-inner"
                style={{ background: accent }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-medium">Текущий акцент</span>
                <span className="block font-mono text-[10px] uppercase tracking-wide text-muted">
                  {accent}
                </span>
              </span>
              <span className="text-[11px] text-muted">
                {pickerOpen ? "Скрыть" : "Выбрать"}
              </span>
              {pickerOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            {pickerOpen && (
              <div className="animate-[fade-up_.35s_cubic-bezier(.22,1,.36,1)]">
                <AccentPicker />
              </div>
            )}
          </div>

          <div className="mt-4 rounded-[28px] border border-line bg-bg/85 p-4 shadow-lift backdrop-blur-xl sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface2 text-accent">
                <Layers size={17} />
              </span>
              <div>
                <h2 className="text-[15px] font-medium tracking-tight">Фон</h2>
                <p className="mt-0.5 text-[12px] text-muted">
                  Сейчас: <span className="text-ink">{current.name}</span>. Все фоны подстраиваются под тему.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {backgrounds.map((item) => {
                const active = item.id === background;

                return (
                  <button
                    key={item.id}
                    onClick={() => setBackground(item.id)}
                    aria-pressed={active}
                    className={`group overflow-hidden rounded-2xl border text-left transition-all duration-300 ${
                      active
                        ? "border-accent/70 bg-surface2 shadow-lift"
                        : "border-line bg-surface2/40 hover:border-lineStrong"
                    }`}
                  >
                    <span
                      className="block h-24 w-full transition-transform duration-500 group-hover:scale-[1.04]"
                      style={preview(item.id)}
                    />
                    <span className="flex items-center gap-2 px-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-medium">{item.name}</span>
                        <span className="block text-[10px] text-muted">{item.text}</span>
                      </span>
                      {active && <Check size={14} className="shrink-0 text-accent" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-[760px] pt-4">
      <div key="root" className="animate-[fade-up_.45s_cubic-bezier(.22,1,.36,1)]">
        <div className="aurora-text">
          <button
            onClick={hide}
            className="flex items-center gap-1.5 text-[12px] text-muted hover:text-ink"
          >
            <ArrowLeft size={14} />
            Назад
          </button>
        </div>

        <div className="relative mt-4 overflow-hidden rounded-[28px] border border-line bg-bg/85 shadow-lift backdrop-blur-xl">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 120% at 15% 0%, rgb(var(--accent-rgb) / 0.2), transparent 60%)",
            }}
          />

          <div className="relative flex flex-wrap items-center gap-4 p-5 sm:p-6">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <div className="relative shrink-0">
                <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-line bg-surface2 text-[20px] font-medium uppercase text-muted sm:h-20 sm:w-20 sm:text-[24px]">
                  {profile?.picture && !avatarFailed ? (
                    <img
                      src={avatarSource(profile.picture)}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={() => setAvatarFailed(true)}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/30 to-surface2 text-accent">
                      {profile?.name.slice(0, 1) ?? "?"}
                    </span>
                  )}
                </span>
                <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-bg bg-accent text-accentText shadow-lg">
                  <SettingsIcon size={13} />
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Настройки</p>
                <h1 className="mt-1 truncate text-[clamp(24px,4vw,34px)] font-semibold tracking-tight">
                  {profile?.name ?? "Аккаунт"}
                </h1>
                <p className="mt-1 text-[12px] text-muted">Внешний вид и аккаунт</p>
              </div>
            </div>

            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <span className="flex items-center gap-1.5 rounded-full border border-line bg-bg/60 px-3 py-1.5 text-[11px] text-muted">
                {theme === "dark" ? <Moon size={13} /> : <Sun size={13} />}
                {theme === "dark" ? "Тёмная тема" : "Светлая тема"}
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-line bg-bg/60 px-3 py-1.5 text-[11px] text-muted">
                <Layers size={13} />
                {current.name}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => setPage("appearance")}
            className="group relative flex h-full flex-col overflow-hidden rounded-[28px] border border-line bg-bg/85 p-5 text-left shadow-lift backdrop-blur-xl transition-colors hover:border-lineStrong"
          >
            <div className="flex items-start justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface2 text-accent">
                <Palette size={17} />
              </span>
              <ChevronRight
                size={16}
                className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
              />
            </div>

            <p className="mt-4 text-[15px] font-medium">Оформление</p>
            <p className="mt-1 text-[12px] text-muted">Акцентный цвет, фон и тема</p>

            <div
              className="relative mt-4 h-24 overflow-hidden rounded-2xl border border-line"
              style={preview(background)}
            >
              <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/40 px-2 py-1 text-[10px] font-medium text-white/85 backdrop-blur-md">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: "var(--accent)" }}
                />
                {current.name}
              </span>
            </div>
          </button>

          <div className="flex h-full flex-col rounded-[28px] border border-line bg-bg/85 p-5 shadow-lift backdrop-blur-xl">
            <div className="flex items-start justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface2 text-muted">
                {theme === "dark" ? <Moon size={17} /> : <Sun size={17} />}
              </span>
              <span className="rounded-full border border-line px-2 py-1 text-[10px] text-muted">
                {theme === "dark" ? "Тёмная" : "Светлая"}
              </span>
            </div>

            <p className="mt-4 text-[15px] font-medium">Тема</p>
            <p className="mt-1 text-[12px] text-muted">Подстрой интерфейс под себя.</p>

            <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
              <button
                onClick={() => {
                  if (theme !== "dark") onToggleTheme();
                }}
                aria-pressed={theme === "dark"}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[12px] transition-colors ${
                  theme === "dark"
                    ? "border-accent/60 bg-accent/10 text-accent"
                    : "border-line text-muted hover:border-lineStrong hover:text-ink"
                }`}
              >
                <Moon size={14} />
                Тёмная
              </button>

              <button
                onClick={() => {
                  if (theme !== "light") onToggleTheme();
                }}
                aria-pressed={theme === "light"}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[12px] transition-colors ${
                  theme === "light"
                    ? "border-accent/60 bg-accent/10 text-accent"
                    : "border-line text-muted hover:border-lineStrong hover:text-ink"
                }`}
              >
                <Sun size={14} />
                Светлая
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-[28px] border border-line bg-bg/85 shadow-lift backdrop-blur-xl">
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-4 px-5 py-4 text-left text-muted transition-colors hover:bg-surface2 hover:text-ink"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface2">
              <LogOut size={18} />
            </span>
            <span className="flex-1 text-[14px] font-medium">Выйти из аккаунта</span>
            <ChevronRight size={16} />
          </button>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted">yuicry · музыка без лишнего</p>
      </div>
    </section>
  );
}
