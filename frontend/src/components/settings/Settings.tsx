"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Layers,
  LogOut,
  Moon,
  Palette,
  Settings as SettingsIcon,
  Sun,
  Volume2,
  VolumeX,
} from "lucide-react";

import AssistantIcon from "@/components/AssistantIcon";
import BackgroundPreview from "@/components/BackgroundPreview";
import Segmented from "@/components/Segmented";
import AccentPicker from "@/components/settings/AccentPicker";
import { avatarSource } from "@/lib/avatar";
import type { Palette as ColorPalette } from "@/lib/palette";
import { useAccentColor } from "@/lib/useAccentColor";
import { backgrounds, useAppearance, type BackgroundId } from "@/store/appearanceStore";
import { useAssistant } from "@/store/assistantStore";
import { useSettings } from "@/store/settingsStore";

type Profile = {
  name: string;
  picture: string;
};

type Props = {
  profile: Profile | null;
  palette: ColorPalette;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onLogout: () => void;
};

function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">{title}</p>
        {hint && <p className="mt-0.5 text-[11.5px] text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export default function Settings({ profile, palette, theme, onToggleTheme, onLogout }: Props) {
  const page = useSettings((state) => state.page);
  const setPage = useSettings((state) => state.setPage);
  const hide = useSettings((state) => state.hide);
  const background = useAppearance((state) => state.background);
  const setBackground = useAppearance((state) => state.setBackground);
  const current = backgrounds.find((item) => item.id === background) ?? backgrounds[0];
  const voice = useAssistant((state) => state.voice);
  const voiceName = useAssistant((state) => state.voiceName);
  const rate = useAssistant((state) => state.rate);
  const setVoice = useAssistant((state) => state.setVoice);
  const setVoiceName = useAssistant((state) => state.setVoiceName);
  const setRate = useAssistant((state) => state.setRate);
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
            Фон, акцентный цвет и тема.
          </p>

          <div className="relative mt-5 overflow-hidden rounded-[24px] border border-line">
            <BackgroundPreview
              id={background}
              colors={palette}
              light={theme === "light"}
              className="block h-32 w-full"
            />
            <div className="absolute inset-0" style={{ background: "var(--veil)" }} />

            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
              <div>
                <p className="text-[13px] font-medium text-white">{current.name}</p>
                <p className="mt-0.5 text-[11px] text-white/60">{current.text}</p>
              </div>
              <span className="rounded-full border border-white/15 bg-black/30 px-2.5 py-1 text-[11px] text-white/80 backdrop-blur-md">
                {theme === "dark" ? "Тёмная" : "Светлая"}
              </span>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-[24px] border border-line bg-bg/85 backdrop-blur-xl">
            <Row title="Акцентный цвет" hint="Кнопки, сердце и активные элементы">
              <button
                onClick={() => setPickerOpen((value) => !value)}
                aria-expanded={pickerOpen}
                className="flex items-center gap-2.5 rounded-full border border-line bg-surface2/60 py-1.5 pl-1.5 pr-3 transition-colors hover:border-lineStrong"
              >
                <span
                  className="h-6 w-6 rounded-full border border-white/20 shadow-inner"
                  style={{ background: accent }}
                />
                <span className="text-[12px] text-muted">{accent}</span>
                {pickerOpen ? (
                  <ChevronUp size={14} className="text-muted" />
                ) : (
                  <ChevronDown size={14} className="text-muted" />
                )}
              </button>
            </Row>

            {pickerOpen && (
              <div className="animate-[fade-up_.3s_cubic-bezier(.22,1,.36,1)] border-t border-line px-4 py-4 sm:px-5">
                <AccentPicker />
              </div>
            )}
          </div>

          <div className="mt-4 overflow-hidden rounded-[24px] border border-line bg-bg/85 backdrop-blur-xl">
            <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
              <Layers size={16} className="text-muted" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">Фон</p>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  Каждый фон берёт цвет из обложки трека.
                </p>
              </div>
            </div>

            <div className="grid gap-3 p-4 pt-0 sm:grid-cols-2 sm:px-5 sm:pb-5">
              {backgrounds.map((item) => {
                const active = item.id === background;

                return (
                  <button
                    key={item.id}
                    onClick={() => setBackground(item.id)}
                    aria-pressed={active}
                    className={`group overflow-hidden rounded-2xl border text-left transition-colors ${
                      active
                        ? "border-accent/60 bg-surface2/60"
                        : "border-line bg-surface2/30 hover:border-lineStrong"
                    }`}
                  >
                    <BackgroundPreview
                      id={item.id}
                      colors={palette}
                      light={theme === "light"}
                      className="block h-24 w-full"
                    />
                    <span className="flex items-center gap-2 px-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-medium">{item.name}</span>
                        <span className="block text-[10px] text-muted">{item.text}</span>
                      </span>
                      {active && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                      )}
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

        <div className="mt-4 flex items-center gap-4">
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
            <h1 className="truncate text-[clamp(22px,4vw,30px)] font-semibold tracking-tight">
              {profile?.name ?? "Аккаунт"}
            </h1>
            <p className="mt-1 text-[12px] text-muted">Внешний вид и аккаунт</p>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-[24px] border border-line bg-bg/85 backdrop-blur-xl">
          <button
            onClick={() => setPage("appearance")}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface2/50 sm:px-5"
          >
            <Palette size={16} className="text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">Фон</span>
              <span className="mt-0.5 block text-[11.5px] text-muted">{current.name}</span>
            </span>
            <BackgroundPreview
              id={background}
              colors={palette}
              light={theme === "light"}
              className="h-9 w-14 shrink-0 rounded-lg border border-line"
            />
            <ChevronRight size={16} className="text-muted" />
          </button>

          <div className="border-t border-line">
            <Row title="Тема">
              <Segmented
                value={theme}
                onChange={(value) => {
                  if (value !== theme) onToggleTheme();
                }}
                options={[
                  { value: "dark", label: "Тёмная", icon: <Moon size={13} /> },
                  { value: "light", label: "Светлая", icon: <Sun size={13} /> },
                ]}
                className="w-[190px]"
              />
            </Row>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-[24px] border border-line bg-bg/85 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
            <AssistantIcon size={18} className="text-muted" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">Ассистент</p>
              <p className="mt-0.5 text-[11.5px] text-muted">Голос и скорость речи</p>
            </div>
            <button
              onClick={() => setVoice(!voice)}
              aria-pressed={voice}
              aria-label={voice ? "Выключить озвучку" : "Включить озвучку"}
              className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
                voice
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-line text-muted hover:border-lineStrong hover:text-ink"
              }`}
            >
              {voice ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
          </div>

          <div className="border-t border-line">
            <Row title="Голос">
              <Segmented
                value={voiceName}
                onChange={setVoiceName}
                options={[
                  { value: "svetlana", label: "Светлана" },
                  { value: "dmitry", label: "Дмитрий" },
                ]}
                className="w-[190px]"
              />
            </Row>
          </div>

          <div className="border-t border-line">
            <Row title="Скорость речи">
              <Segmented
                value={rate}
                onChange={setRate}
                options={[
                  { value: 0.9, label: "0.9×" },
                  { value: 1, label: "1.0×" },
                  { value: 1.1, label: "1.1×" },
                ]}
                className="w-[190px]"
              />
            </Row>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-[24px] border border-line bg-bg/85 backdrop-blur-xl">
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-muted transition-colors hover:bg-surface2/50 hover:text-ink sm:px-5"
          >
            <LogOut size={16} />
            <span className="flex-1 text-[13px] font-medium">Выйти из аккаунта</span>
            <ChevronRight size={16} />
          </button>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted">yuicry · музыка без лишнего</p>
      </div>
    </section>
  );
}
