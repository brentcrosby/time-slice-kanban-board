import React from "react";

export function ColumnChip({ children, backgroundColor, color, borderColor = "transparent", title, ariaLabel }) {
  return (
    <span
      className="shrink-0 rounded-full border px-2 py-px text-sm tabular-nums md:text-xs"
      title={title}
      aria-label={ariaLabel}
      style={{ backgroundColor, color, borderColor }}
    >
      {children}
    </span>
  );
}
