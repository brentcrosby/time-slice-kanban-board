import React from "react";
import { Volume2, VolumeX, Sun, Moon } from "lucide-react";
import { Modal } from "./Modal";

export function SettingsModal({ onClose, theme, setTheme, sound, setSound, onTest, palette, chimeActive, onStopChime }) {
  return (
    <Modal onClose={onClose} title="Settings" palette={palette}>
      <div className="space-y-6">
        <section>
          <h4 className="text-sm font-semibold" style={{ color: palette.text }}>
            Appearance
          </h4>
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={() => setTheme("dark")}
              className={`rounded-lg px-3 py-2 text-sm ${theme === "dark" ? "font-semibold" : ""}`}
              style={{ border: `1px solid ${palette.border}` }}
            >
              <span className="inline-flex items-center gap-2">
                <Moon className="h-4 w-4" /> Dark
              </span>
            </button>
            <button
              onClick={() => setTheme("light")}
              className={`rounded-lg px-3 py-2 text-sm ${theme === "light" ? "font-semibold" : ""}`}
              style={{ border: `1px solid ${palette.border}` }}
            >
              <span className="inline-flex items-center gap-2">
                <Sun className="h-4 w-4" /> Light
              </span>
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
                className="rounded-md px-2 py-1 text-sm"
                style={{ backgroundColor: "transparent", border: `1px solid ${palette.border}`, color: palette.text }}
              >
                <option value="ping">Ping</option>
                <option value="bell">Bell</option>
                <option value="alarm">Alarm</option>
                <option value="wood">Woodblock</option>
              </select>
              <button
                onClick={onTest}
                className="rounded-md px-2 py-1 text-sm"
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
                  className="rounded-md px-2 py-1 text-sm"
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

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${palette.border}` }}
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
