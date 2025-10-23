import React, { useEffect } from "react";
import { X } from "lucide-react";
import { MODAL_OVERLAY_COLOR } from "../constants/themeColors";

export function Modal({ title, onClose, children, palette }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center p-4">
      <div className="absolute inset-0" onClick={onClose} style={{ backgroundColor: MODAL_OVERLAY_COLOR }} />
      <div
        className="relative z-10 w-full max-w-lg rounded-2xl p-4 shadow-xl border"
        style={{ backgroundColor: palette.surface, borderColor: palette.border }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold" style={{ color: palette.text }}>
            {title}
          </h3>
          <button onClick={onClose} className="interactive-button rounded-md p-1" style={{ color: palette.subtext }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
