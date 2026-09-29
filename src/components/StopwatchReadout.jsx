import React from "react";
import { Timer } from "lucide-react";
import { secsToHMS } from "../utils/time";

export function StopwatchReadout({ elapsed, label, palette, color, compact = false }) {
  const formatted = secsToHMS(Math.floor(elapsed));
  return (
    <span
      title={label}
      aria-label={`${label}, ${formatted}`}
      className={`flex shrink-0 items-center gap-1 rounded-md py-1 text-sm tabular-nums md:text-xs ${compact ? "px-1.5" : "px-2 font-medium"}`}
      style={{ backgroundColor: palette.badge, color }}
    >
      <Timer size={compact ? 14 : 16} />{formatted}
    </span>
  );
}
