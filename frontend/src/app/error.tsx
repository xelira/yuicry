"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-[15px] font-semibold">Что-то пошло не так</p>
      <p className="max-w-[320px] text-[13px] leading-relaxed text-muted">
        Обнови страницу. Если ошибка повторяется, попробуй позже.
      </p>
      <button
        onClick={reset}
        className="rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-accentText hover:brightness-110"
      >
        Перезагрузить
      </button>
    </div>
  );
}
