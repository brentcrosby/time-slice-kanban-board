import React from "react";
import { Settings as SettingsIcon } from "lucide-react";

export function Header({
  filter,
  setFilter,
  onAdd,
  onClear,
  onOpenSettings,
  runningCount,
  palette,
  theme,
}) {
  return (
    <div
      className="sticky top-0 z-10 w-full border-b backdrop-blur"
      style={{ backgroundColor: palette.headerBg, borderColor: palette.border }}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: palette.text }}>
          Kanban Timers
        </h1>
        <span
          className="ml-2 rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: palette.badge, color: palette.subtext }}
        >
          {runningCount} running
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter tasks..."
              className="w-64 rounded-xl px-3 py-2 text-sm outline-none ring-0"
              style={{
                backgroundColor: theme === "dark" ? "#1f1f1f" : "#ffffff",
                border: `1px solid ${palette.border}`,
                color: palette.text,
              }}
            />
          </div>
          <button
            onClick={onAdd}
            className="rounded-xl px-3 py-2 text-sm font-medium"
            style={{ backgroundColor: palette.text, color: palette.bg }}
          >
            New
          </button>
          <button
            onClick={onClear}
            className="rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${palette.border}` }}
          >
            Clear
          </button>
          <button
            onClick={onOpenSettings}
            title="Settings"
            className="rounded-md p-2"
            style={{ border: `1px solid ${palette.border}` }}
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
