import { DEFAULT_SOUND, SOUND_KEY, STORAGE_KEY, THEME_KEY } from "../constants";
import { CARD_CONTROLS } from "../constants/cardControls";

export function loadPinnedControls() {
  try {
    const saved = JSON.parse(localStorage.getItem("tasky:pinned-controls"));
    return Array.isArray(saved) ? CARD_CONTROLS.filter(({ id }) => saved.includes(id)).map(({ id }) => id) : ["stopwatch"];
  } catch { return ["stopwatch"]; }
}

export function savePinnedControls(controls) {
  try { localStorage.setItem("tasky:pinned-controls", JSON.stringify(controls)); }
  catch { /* Preferences still work for this session. */ }
}

const SUBTASK_STOPWATCH_BUTTON_KEY = "tasky:subtask-stopwatch-button";

export function loadSubtaskStopwatchButton() {
  try { return localStorage.getItem(SUBTASK_STOPWATCH_BUTTON_KEY) !== "false"; }
  catch { return true; }
}

export function saveSubtaskStopwatchButton(visible) {
  try { localStorage.setItem(SUBTASK_STOPWATCH_BUTTON_KEY, String(visible)); }
  catch { /* Preferences still work for this session. */ }
}

const SYNC_BASELINE_KEY = "kanban-timer-board:sync-baseline:v1";

export function loadSyncBaseline(uid) {
  try {
    const saved = JSON.parse(localStorage.getItem(SYNC_BASELINE_KEY));
    return saved?.uid === uid && typeof saved.fingerprint === "string"
      ? { fingerprint: saved.fingerprint, revision: Number.isSafeInteger(saved.revision) ? saved.revision : 0 }
      : null;
  } catch {
    return null;
  }
}

export function saveSyncBaseline(uid, fingerprint, revision = 0) {
  try {
    localStorage.setItem(SYNC_BASELINE_KEY, JSON.stringify({ uid, fingerprint, revision }));
  } catch {
    // Sync still works in memory when browser storage is unavailable.
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore write errors
  }
}

export function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SYNC_BASELINE_KEY);
  } catch {
    // Ignore storage errors; the in-memory board is still cleared.
  }
}

export const loadTheme = () => {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return ["system", "light", "dark"].includes(saved) ? saved : "system";
  } catch {
    return "system";
  }
};

export const saveTheme = (theme) => {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore write errors
  }
};

export const loadSound = () => {
  try {
    const raw = localStorage.getItem(SOUND_KEY);
    if (!raw) return DEFAULT_SOUND;
    return { ...DEFAULT_SOUND, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SOUND;
  }
};

export const saveSound = (sound) => {
  try {
    localStorage.setItem(SOUND_KEY, JSON.stringify(sound));
  } catch {
    // Ignore write errors
  }
};
