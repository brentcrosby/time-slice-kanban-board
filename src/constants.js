export const MIN_SEGMENT_SEC = 5;
export const MAX_SEGMENT_SEC = 24 * 3600;

export const DEFAULT_COLUMNS = [
  { id: "todo", name: "Do" },
  { id: "doing", name: "Doing" },
  { id: "done", name: "Done" },
];

export const STORAGE_KEY = "kanban-timer-board:v1";
export const THEME_KEY = "kanban-theme";
export const SOUND_KEY = "kanban-sound";

export const DEFAULT_SOUND = { enabled: true, type: "ping", volume: 0.7, loop: true };
