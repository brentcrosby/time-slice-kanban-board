import React, { forwardRef } from "react";
import { MoreHorizontal } from "lucide-react";

export const MenuButton = forwardRef(function MenuButton({ color, className = "", style, ...props }, ref) {
  return (
    <button
      {...props}
      ref={ref}
      type="button"
      className={`interactive-button flex shrink-0 items-center justify-center rounded-md p-2 hover:bg-black/10 md:p-1 ${className}`}
      style={{ color, ...style }}
    >
      <MoreHorizontal className="h-4 w-4" />
    </button>
  );
});
