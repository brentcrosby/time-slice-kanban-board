import React from "react";
import { Trash2 } from "lucide-react";

export function SegmentRowsEditor({ rows, errors, onChange, onRemove, palette, maxHeight = "", showIndex = true }) {
  const containerCls = maxHeight ? `space-y-2 ${maxHeight} overflow-y-auto pr-1` : "space-y-2";

  return (
    <div className={containerCls}>
      {rows.map((row, idx) => (
        <div key={row.id} className="space-y-1">
          <div className="flex items-center gap-2">
            {showIndex ? (
              <span className="text-[11px]" style={{ color: palette.subtext, minWidth: 18 }}>
                #{idx + 1}
              </span>
            ) : null}
            <input
              value={row.value}
              onChange={(e) => onChange(row.id, e.target.value)}
              placeholder="25m"
              className="flex-1 rounded-md px-2 py-1 text-xs outline-none"
              style={{ border: `1px solid ${palette.border}`, backgroundColor: "transparent", color: palette.text }}
            />
            {onRemove ? (
              <button
                type="button"
                className="rounded-md p-1"
                style={{ border: `1px solid ${palette.border}`, color: palette.subtext }}
                onClick={() => onRemove(row.id)}
                aria-label="Remove segment"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            ) : null}
          </div>
          {errors?.[row.id] ? (
            <p className="text-[10px]" style={{ color: palette.dangerText }}>
              {errors[row.id]}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
