"use client";

import dynamic from "next/dynamic";

import type { Palette } from "@/lib/palette";
import { useAppearance } from "@/store/appearanceStore";

const Aurora = dynamic(() => import("@/components/Aurora"), {
  ssr: false,
  loading: () => null,
});

const Contour = dynamic(() => import("@/components/backgrounds/Contour"), {
  ssr: false,
  loading: () => null,
});

const Moire = dynamic(() => import("@/components/backgrounds/Moire"), {
  ssr: false,
  loading: () => null,
});

const Halftone = dynamic(() => import("@/components/backgrounds/Halftone"), {
  ssr: false,
  loading: () => null,
});

const Blueprint = dynamic(() => import("@/components/backgrounds/Blueprint"), {
  ssr: false,
  loading: () => null,
});

const Weave = dynamic(() => import("@/components/backgrounds/Weave"), {
  ssr: false,
  loading: () => null,
});

type Props = {
  colors: Palette;
  light?: boolean;
};

export default function Background({ colors, light = false }: Props) {
  const background = useAppearance((state) => state.background);

  if (background === "contour") return <Contour colors={colors} light={light} />;
  if (background === "moire") return <Moire colors={colors} light={light} />;
  if (background === "halftone") return <Halftone colors={colors} light={light} />;
  if (background === "blueprint") return <Blueprint colors={colors} light={light} />;
  if (background === "weave") return <Weave colors={colors} light={light} />;

  return <Aurora colors={colors} light={light} />;
}
