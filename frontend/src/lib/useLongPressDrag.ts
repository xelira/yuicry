"use client";

import { useEffect, useRef, useState } from "react";

import { useDrag, type DragKind, type DragTarget } from "@/store/dragStore";

type Options = {
  kind: DragKind;
  title: string;
  cover?: string;
  onDrop: () => void;
  onAttach?: () => void;
  disabled?: boolean;
};

const holdDelay = 450;
const moveTolerance = 8;
const dropLine = 200;

export function useLongPressDrag({
  kind,
  title,
  cover,
  onDrop,
  onAttach,
  disabled = false,
}: Options) {
  const timer = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const active = useRef(false);
  const blocked = useRef(false);
  const [pressed, setPressed] = useState(false);

  const stopTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => stopTimer, []);

  useEffect(() => {
    if (!pressed) return;

    const prevent = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };

    document.addEventListener("touchmove", prevent, { passive: false });
    return () => document.removeEventListener("touchmove", prevent);
  }, [pressed]);

  const handlers = {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (disabled || event.button !== 0) return;

      const element = event.currentTarget;
      const startX = event.clientX;
      const startY = event.clientY;

      origin.current = { x: startX, y: startY };
      stopTimer();

      timer.current = window.setTimeout(() => {
        timer.current = null;
        active.current = true;
        blocked.current = true;
        setPressed(true);
        useDrag.getState().begin({ kind, title, cover, onDrop, onAttach }, startX, startY);

        try {
          element.setPointerCapture(event.pointerId);
        } catch (error) {
          return;
        }

        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate(12);
        }
      }, holdDelay);
    },

    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      if (!active.current) {
        const distance = Math.hypot(
          event.clientX - origin.current.x,
          event.clientY - origin.current.y,
        );

        if (distance > moveTolerance) stopTimer();
        return;
      }

      event.preventDefault();

      const item = useDrag.getState().item;
      const overAssistant = Boolean(item?.onAttach) && event.clientY > window.innerHeight * 0.62;
      const target: DragTarget = overAssistant
        ? "assistant"
        : event.clientY < dropLine
          ? "delete"
          : "none";

      useDrag.getState().move(event.clientX, event.clientY, target);
    },

    onPointerUp: () => {
      stopTimer();

      if (!active.current) return;

      active.current = false;
      setPressed(false);
      useDrag.getState().finish();

      window.setTimeout(() => {
        blocked.current = false;
      }, 400);
    },

    onPointerCancel: () => {
      stopTimer();

      if (!active.current) return;

      active.current = false;
      setPressed(false);
      blocked.current = false;
      useDrag.getState().clear();
    },

    onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
      if (active.current || pressed) event.preventDefault();
    },
  };

  const consumeClick = () => {
    if (!blocked.current) return false;

    blocked.current = false;
    return true;
  };

  return { handlers, pressed, consumeClick };
}
