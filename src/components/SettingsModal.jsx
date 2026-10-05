import React from "react";
import { Volume2, VolumeX, Sun, Moon, Monitor } from "lucide-react";
import { Modal } from "./Modal";
import { CARD_CONTROLS } from "../constants/cardControls";

export function SettingsModal({
  onClose,
  themePreference,
  setThemePreference,
  sound,
  setSound,
  autoStartStopwatchOnDrop,
  setAutoStartStopwatchOnDrop,
  autoMoveEnabled,
  setAutoMoveEnabled,
  onTest,
  palette,
  chimeActive,
  onStopChime,
  onRequestClearAll,
  pinnedControls,
  setPinnedControls,
  showSubtaskStopwatchButton,
  setShowSubtaskStopwatchButton,
}) {
  return (
    <Modal onClose={onClose} title="Settings" palette={palette}>
      <div className="space-y-6">
        <section>
          <h4 className="text-sm font-semibold" style={{ color: palette.text }}>Pinned task controls</h4>
          <p className="mt-1 text-xs" style={{ color: palette.subtext }}>Show your favorite controls to the left of each task’s three-dot menu. Active features keep their controls visible. Saved on this device.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {CARD_CONTROLS.map(({ id, label }) => <label key={id} className="inline-flex items-center gap-2 text-sm" style={{ color: palette.text }}>
              <input type="checkbox" checked={pinnedControls.includes(id)} onChange={(event) => setPinnedControls((current) => event.target.checked ? [...current, id] : current.filter((item) => item !== id))} />
              {label}
            </label>)}
          </div>
        </section>

        <section>
          <h4 className="text-sm font-semibold" style={{ color: palette.text }}>Subtask controls</h4>
          <label className="mt-3 inline-flex items-center gap-2 text-sm" style={{ color: palette.text }}>
            <input type="checkbox" checked={showSubtaskStopwatchButton} onChange={(event) => setShowSubtaskStopwatchButton(event.target.checked)} />
            Show subtask stopwatch button
          </label>
          <p className="mt-1 text-xs" style={{ color: palette.subtext }}>When off, start it from the subtask menu. Active stopwatch controls stay visible. Saved on this device.</p>
        </section>

        <section>
          <h4 className="text-sm font-semibold" style={{ color: palette.text }}>
            Appearance
          </h4>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setThemePreference("system")}
              aria-pressed={themePreference === "system"}
              className={`interactive-button rounded-lg px-3 py-2 text-sm ${themePreference === "system" ? "font-semibold" : ""}`}
              style={{ border: `1px solid ${palette.border}`, backgroundColor: themePreference === "system" ? palette.badge : undefined, color: palette.text }}
            >
              <span className="inline-flex items-center gap-2">
                <Monitor className="h-4 w-4" /> System
              </span>
            </button>
            <button
              onClick={() => setThemePreference("light")}
              aria-pressed={themePreference === "light"}
              className={`interactive-button rounded-lg px-3 py-2 text-sm ${themePreference === "light" ? "font-semibold" : ""}`}
              style={{ border: `1px solid ${palette.border}`, backgroundColor: themePreference === "light" ? palette.badge : undefined, color: palette.text }}
            >
              <span className="inline-flex items-center gap-2"><Sun className="h-4 w-4" /> Light</span>
            </button>
            <button
              onClick={() => setThemePreference("dark")}
              aria-pressed={themePreference === "dark"}
              className={`interactive-button rounded-lg px-3 py-2 text-sm ${themePreference === "dark" ? "font-semibold" : ""}`}
              style={{ border: `1px solid ${palette.border}`, backgroundColor: themePreference === "dark" ? palette.badge : undefined, color: palette.text }}
            >
              <span className="inline-flex items-center gap-2"><Moon className="h-4 w-4" /> Dark</span>
            </button>
          </div>
        </section>

        <section>
          <h4 className="text-sm font-semibold" style={{ color: palette.text }}>
            Sound
          </h4>
          <div className="mt-2 space-y-3">
            <label className="inline-flex items-center gap-2 text-sm" style={{ color: palette.text }}>
              <input
                type="checkbox"
                checked={!!sound.enabled}
                onChange={(event) => setSound({ ...sound, enabled: event.target.checked })}
              />
              {sound.enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} Enable chime on completion
            </label>

            <div className="flex items-center gap-3">
              <label className="text-sm" style={{ color: palette.subtext, minWidth: 64 }}>
                Chime
              </label>
              <select
                value={sound.type}
                onChange={(event) => setSound({ ...sound, type: event.target.value })}
                className="rounded-md px-2 py-1 text-base md:text-sm"
                style={{ backgroundColor: "transparent", border: `1px solid ${palette.border}`, color: palette.text }}
              >
                <option value="ping">Ping</option>
                <option value="bell">Bell</option>
                <option value="alarm">Alarm</option>
                <option value="wood">Woodblock</option>
              </select>
              <button
                onClick={onTest}
                className="interactive-button rounded-md px-2 py-1 text-sm"
                style={{ border: `1px solid ${palette.border}` }}
              >
                Test
              </button>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm" style={{ color: palette.subtext, minWidth: 64 }}>
                Volume
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={sound.volume}
                onChange={(event) => setSound({ ...sound, volume: Number(event.target.value) })}
                className="w-40"
              />
              <span className="tabular-nums text-sm" style={{ color: palette.subtext }}>
                {Math.round(sound.volume * 100)}%
              </span>
            </div>

            <label className="inline-flex items-center gap-2 text-sm" style={{ color: palette.text }}>
              <input
                type="checkbox"
                checked={!!sound.loop}
                onChange={(event) => setSound({ ...sound, loop: event.target.checked })}
              />
              Play until stopped
            </label>

            {chimeActive && (
              <div className="flex items-center gap-2">
                <button
                  onClick={onStopChime}
                  className="interactive-button rounded-md px-2 py-1 text-sm"
                  style={{ border: `1px solid ${palette.border}` }}
                >
                  <VolumeX className="inline h-4 w-4 mr-1" /> Stop chime
                </button>
                <span className="text-xs" style={{ color: palette.subtext }}>
                  Chime is playing…
                </span>
              </div>
            )}
          </div>
        </section>

        <section>
          <h4 className="text-sm font-semibold" style={{ color: palette.text }}>
            Tasks
          </h4>
          <div className="mt-2 space-y-3">
            <label className="inline-flex items-center gap-2 text-sm" style={{ color: palette.text }}>
              <input
                type="checkbox"
                checked={!!autoMoveEnabled}
                onChange={(event) => setAutoMoveEnabled(!!event.target.checked)}
              />
              Auto move tasks with timer
            </label>
            <p className="text-xs" style={{ color: palette.subtext }}>
              When off, cards stay in their column after starting or finishing a timer. Starting a stopwatch in Do always moves the task to Doing.
            </p>
            <label className="inline-flex items-center gap-2 text-sm" style={{ color: palette.text }}>
              <input type="checkbox" checked={autoStartStopwatchOnDrop} onChange={(event) => setAutoStartStopwatchOnDrop(event.target.checked)} />
              Start unstarted stopwatches when dropped into Doing
            </label>
            <p className="text-xs" style={{ color: palette.subtext }}>
              Starts a zero-time stopwatch when you drag a task into Doing, including selected tasks. Paused clocks with logged time stay paused. Saved on this device.
            </p>
            <button
              type="button"
              onClick={() => onRequestClearAll?.()}
              className="interactive-button w-full rounded-lg px-3 py-2 text-sm font-semibold"
              style={{ backgroundColor: palette.dangerBg, color: palette.dangerText }}
            >
              Clear all tasks…
            </button>
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="interactive-button rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${palette.border}` }}
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
