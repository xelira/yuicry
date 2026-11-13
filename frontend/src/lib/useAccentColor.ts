"use client";

import { useEffect, useState } from "react";

import { currentAccent } from "@/lib/color";

export function useAccentColor() {
  const [color, setColor] = useState("#ff5a36");

  useEffect(() => {
    setColor(currentAccent());

    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<string | null>).detail;
      setColor(detail || currentAccent());
    };

    window.addEventListener("yuicry:accent", onChange);
    return () => window.removeEventListener("yuicry:accent", onChange);
  }, []);

  return color;
}
