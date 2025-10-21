import { DEFAULT_SOUND, SOUND_KEY, STORAGE_KEY, THEME_KEY } from "../constants";

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
