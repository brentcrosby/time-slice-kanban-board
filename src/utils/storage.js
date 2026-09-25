import { DEFAULT_SOUND, SOUND_KEY, STORAGE_KEY, THEME_KEY } from "../constants";

const SYNC_BASELINE_KEY = "kanban-timer-board:sync-baseline:v1";

export function loadSyncBaseline(uid) {
  try {
    const saved = JSON.parse(localStorage.getItem(SYNC_BASELINE_KEY));
    return saved?.uid === uid && typeof saved.fingerprint === "string" ? saved.fingerprint : null;
  } catch {
    return null;
  }
}

export function saveSyncBaseline(uid, fingerprint) {
  try {
    localStorage.setItem(SYNC_BASELINE_KEY, JSON.stringify({ uid, fingerprint }));
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
    return localStorage.getItem(THEME_KEY) || "dark";
  } catch {
    return "dark";
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
