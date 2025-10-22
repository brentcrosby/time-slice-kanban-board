import React from "react";
import { Moon, Settings as SettingsIcon, Sun } from "lucide-react";

export function Header({
  onClear,
  onOpenSettings,
  onToggleTheme,
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
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onClear}
            className="interactive-button rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${palette.border}` }}
          >
            Clear
          </button>
          <button
            onClick={onOpenSettings}
            title="Settings"
            className="interactive-button rounded-md p-2"
            style={{ border: `1px solid ${palette.border}` }}
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
          <button
            onClick={onToggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="interactive-button rounded-md p-2"
            style={{ border: `1px solid ${palette.border}` }}
          >
            {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
