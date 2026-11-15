"use client";

import Background from "@/components/Background";
import type { Palette } from "@/lib/palette";
import type { BackgroundId } from "@/store/appearanceStore";

type Props = {
  id: BackgroundId;
  colors: Palette;
  light?: boolean;
  className?: string;
};

export default function BackgroundPreview({ id, colors, light = false, className = "" }: Props) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div className="absolute left-0 top-0 h-[200%] w-[200%] origin-top-left scale-50">
        <Background id={id} colors={colors} light={light} />
      </div>
    </div>
  );
}
