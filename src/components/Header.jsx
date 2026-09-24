import React from "react";
import { Cloud, CloudOff, Coffee, HelpCircle, LogIn, LogOut, Moon, Settings as SettingsIcon, Sun } from "lucide-react";

export function Header({
  onOpenHelp,
  onOpenSettings,
  onToggleTheme,
  onStartBreak,
  onStopChime,
  palette,
  theme,
  chimeActive,
  syncUser,
  syncStatus,
  syncConfigured,
  onSignIn,
  onSignOut,
  onOpenSyncSetup,
}) {
  return (
    <div
      className="sticky top-0 z-10 w-full border-b backdrop-blur"
      style={{ backgroundColor: palette.headerBg, borderColor: palette.border }}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: palette.text }}>
          Tasky
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {syncConfigured ? (
            syncUser ? (
              <>
                <span className="hidden items-center gap-1.5 px-1 text-xs sm:flex" style={{ color: palette.subtext }} title={syncUser.email || "Signed in"}>
                  <Cloud className="h-4 w-4" />
                  <span className="max-w-28 truncate">{syncStatus === "synced" ? "Synced" : syncStatus === "connecting" ? "Syncing…" : syncStatus === "error" ? "Sync issue" : syncUser.displayName || "Account"}</span>
                </span>
                <button onClick={onSignOut} title={`Sign out${syncUser.email ? ` (${syncUser.email})` : ""}`} aria-label="Sign out" className="header-action-button rounded-md p-2" style={{ border: `1px solid ${palette.border}` }}>
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            ) : (
              <button onClick={onSignIn} title="Sign in with Google to sync your tasks" className="header-action-button flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm" style={{ borderColor: palette.border, color: palette.text }}>
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">Sign in</span>
              </button>
            )
          ) : (
            <button onClick={onOpenSyncSetup} title="Set up Google sign-in and task sync" aria-label="Set up task sync" className="header-action-button rounded-md p-2" style={{ border: `1px solid ${palette.border}` }}>
              <CloudOff className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onOpenHelp}
            title="Shorthand reference"
            className="header-action-button rounded-md p-2"
            style={{ border: `1px solid ${palette.border}` }}
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <button
            onClick={chimeActive ? onStopChime : onStartBreak}
            title={chimeActive ? "Mute chime" : "Start a 10 minute break"}
            className="header-action-button rounded-md p-2"
            style={{
              border: `1px solid ${palette.border}`,
              backgroundColor: chimeActive ? palette.dangerBg : undefined,
              color: chimeActive ? palette.dangerText : undefined,
            }}
          >
            <Coffee className="h-4 w-4" />
          </button>
          <button
            onClick={onOpenSettings}
            title="Settings"
            className="header-action-button rounded-md p-2"
            style={{ border: `1px solid ${palette.border}` }}
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
          <button
            onClick={onToggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="header-action-button rounded-md p-2"
            style={{ border: `1px solid ${palette.border}` }}
          >
            {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
