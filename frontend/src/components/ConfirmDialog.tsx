"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  title: string;
  text: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel = "Удалить",
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        onClick={onCancel}
        aria-label="Отмена"
        className="absolute inset-0 animate-[fade-in_.2s_ease-out] bg-black/60 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-[360px] animate-[sheet-in_.35s_cubic-bezier(.22,1,.36,1)] rounded-3xl border border-line bg-bg p-5 shadow-2xl"
      >
        <h2 className="text-[17px] font-medium tracking-tight">{title}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{text}</p>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-line px-3 py-2.5 text-[12px] text-muted transition-colors hover:border-lineStrong hover:text-ink"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-accent px-3 py-2.5 text-[12px] font-medium text-accentText transition hover:brightness-110"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
