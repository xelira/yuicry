"use client";

import dynamic from "next/dynamic";

import type { Palette } from "@/lib/palette";
import { useAppearance, type BackgroundId } from "@/store/appearanceStore";

const Aurora = dynamic(() => import("@/components/Aurora"), {
  ssr: false,
  loading: () => null,
});

const Contour = dynamic(() => import("@/components/backgrounds/Contour"), {
  ssr: false,
  loading: () => null,
});

const BlackHole = dynamic(() => import("@/components/backgrounds/BlackHole"), {
  ssr: false,
  loading: () => null,
});

const Field = dynamic(() => import("@/components/backgrounds/Field"), {
  ssr: false,
  loading: () => null,
});

const Film = dynamic(() => import("@/components/backgrounds/Film"), {
  ssr: false,
  loading: () => null,
});

const Glass = dynamic(() => import("@/components/backgrounds/Glass"), {
  ssr: false,
  loading: () => null,
});

type Props = {
  colors: Palette;
  light?: boolean;
  id?: BackgroundId;
};

export default function Background({ colors, light = false, id }: Props) {
  const selected = useAppearance((state) => state.background);
  const background = id ?? selected;

  if (background === "contour") return <Contour colors={colors} light={light} />;
  if (background === "blackhole") return <BlackHole colors={colors} light={light} />;
  if (background === "field") return <Field colors={colors} light={light} />;
  if (background === "film") return <Film colors={colors} light={light} />;
  if (background === "glass") return <Glass colors={colors} light={light} />;

  return <Aurora colors={colors} light={light} />;
}
