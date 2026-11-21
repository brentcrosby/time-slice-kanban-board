import React from "react";
import { Archive, Cloud, CloudOff, HelpCircle, LogIn, LogOut, Moon, Settings as SettingsIcon, Sun, VolumeX } from "lucide-react";
import { GlobalTimer } from "./GlobalTimer";

export function Header({
  onOpenHelp,
  onOpenSettings,
  onToggleTheme,
  onGlobalTimerComplete,
  onStopChime,
  palette,
  theme,
  themePreference,
  chimeActive,
  syncUser,
  syncStatus,
  syncConfigured,
  onSignIn,
  onSignOut,
  onOpenSyncSetup,
  onOpenArchive,
}) {
  return (
    <div
      className="sticky top-0 z-[15] w-full border-b backdrop-blur"
      style={{ backgroundColor: palette.headerBg, borderColor: palette.border }}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-3 py-3 sm:px-4">
        <h1 aria-label="Tasky" className="flex shrink-0 items-baseline gap-0.5 text-xl font-semibold tracking-tight" style={{ color: palette.text }}>
          <svg aria-hidden="true" viewBox="48 66 420 392" className="h-5 w-5" fill="currentColor" style={{ verticalAlign: "baseline" }}>
            <rect x="48" y="66" width="132" height="140" rx="24" />
            <rect x="192" y="66" width="132" height="392" rx="24" />
            <rect x="336" y="66" width="132" height="140" rx="24" />
          </svg><span aria-hidden="true">asky</span>
        </h1>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1 sm:gap-2">
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
            onClick={onOpenArchive}
            title="View archive"
            aria-label="View archive"
            className="header-action-button rounded-md p-2"
            style={{ border: `1px solid ${palette.border}` }}
          >
            <Archive className="h-4 w-4" />
          </button>
          <button
            onClick={onOpenHelp}
            title="Shorthand reference"
            className="header-action-button rounded-md p-2"
            style={{ border: `1px solid ${palette.border}` }}
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <GlobalTimer palette={palette} onComplete={onGlobalTimerComplete} />
          {chimeActive && <button type="button" onClick={onStopChime} title="Mute chime" aria-label="Mute chime"
            className="header-action-button rounded-md border p-2"
            style={{ borderColor: palette.border, backgroundColor: palette.dangerBg, color: palette.dangerText }}>
            <VolumeX className="h-4 w-4" />
          </button>}
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
            title={themePreference === "system"
              ? `Following system ${theme} mode. Click to switch to ${theme === "dark" ? "light" : "dark"} mode.`
              : theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
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
