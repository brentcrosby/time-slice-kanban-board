import React, { useState, useEffect, useMemo, useRef } from "react";
import { Play, Pause, RotateCcw, Pencil, Trash2, X, Settings as SettingsIcon, Volume2, VolumeX, Sun, Moon } from "lucide-react";

// =====================
// Utilities
// =====================
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
const pad2 = (n) => n.toString().padStart(2, "0");

const secsToHMS = (s) => {
  const sign = s < 0 ? "-" : "";
  s = Math.abs(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h) return `${sign}${h}:${pad2(m)}:${pad2(sec)}`;
  return `${sign}${m}:${pad2(sec)}`;
};

// HH:MM (zero padded; no seconds)
const secsToHHMM = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${pad2(h)}:${pad2(m)}`;
};

const MIN_SEGMENT_SEC = 5;
const MAX_SEGMENT_SEC = 24 * 3600;

const sanitizeSegmentDuration = (sec) => clamp(Math.floor(sec || 0), MIN_SEGMENT_SEC, MAX_SEGMENT_SEC);

const coerceSegmentDurations = (rawSegments, fallbackSec = 1500) => {
  const durations = (rawSegments || [])
    .map((seg) => {
      if (typeof seg === "number") return sanitizeSegmentDuration(seg);
      if (seg == null) return null;
      const candidate = seg.durationSec ?? seg.duration ?? seg.seconds ?? seg.remainingSec;
      if (candidate == null) return null;
      return sanitizeSegmentDuration(candidate);
    })
    .filter((sec) => Number.isFinite(sec) && sec >= MIN_SEGMENT_SEC);
  if (durations.length) return durations;
  return [sanitizeSegmentDuration(fallbackSec || 1500)];
};

const withSegmentIds = (segments, cardId = "card") =>
  segments.map((seg, idx) => ({
    id: seg.id || `${cardId}-seg-${idx}-${Math.random().toString(36).slice(2, 7)}`,
    durationSec: sanitizeSegmentDuration(seg.durationSec ?? seg.duration ?? seg.seconds ?? seg.remainingSec ?? MIN_SEGMENT_SEC),
    remainingSec: clamp(
      Math.floor(seg.remainingSec ?? seg.durationSec ?? seg.duration ?? seg.seconds ?? seg.remainingSec ?? MIN_SEGMENT_SEC),
      0,
      sanitizeSegmentDuration(seg.durationSec ?? seg.duration ?? seg.seconds ?? seg.remainingSec ?? MIN_SEGMENT_SEC)
    ),
  }));

const normalizeSegments = (rawSegments, cardId = "card") => {
  const withDurations = withSegmentIds(rawSegments, cardId).map((seg) => {
    const durationSec = sanitizeSegmentDuration(seg.durationSec);
    const remainingSec = clamp(Math.floor(seg.remainingSec ?? durationSec), 0, durationSec);
    return { ...seg, durationSec, remainingSec };
  });
  return withDurations;
};

const totalFromSegments = (segments) => segments.reduce((acc, seg) => acc + Math.max(0, Math.floor(seg.durationSec || 0)), 0);

const findNextActiveSegment = (segments) => {
  const idx = segments.findIndex((seg) => (seg.remainingSec ?? 0) > 0);
  if (idx === -1) return Math.max(0, segments.length - 1);
  return idx;
};

const deriveCardFromSegments = (card, rawSegments, overrides = {}) => {
  const segments = normalizeSegments(rawSegments, card.id || overrides.id || "card");
  const totalDuration = totalFromSegments(segments);
  const totalRemaining = segments.reduce((acc, seg) => acc + seg.remainingSec, 0);
  const requestedIndex = overrides.activeSegmentIndex ?? card.activeSegmentIndex;
  let activeSegmentIndex =
    typeof requestedIndex === "number" && !Number.isNaN(requestedIndex)
      ? clamp(requestedIndex, 0, Math.max(segments.length - 1, 0))
      : findNextActiveSegment(segments);
  if (!Number.isFinite(activeSegmentIndex)) activeSegmentIndex = findNextActiveSegment(segments);
  const activeSegment = segments[activeSegmentIndex] || segments[segments.length - 1] || { remainingSec: 0 };
  const isRunning = overrides.running ?? card.running ?? false;
  const remainingSecAtStart =
    overrides.remainingSecAtStart ?? (isRunning ? card.remainingSecAtStart ?? activeSegment.remainingSec : activeSegment.remainingSec);
  const overtime = overrides.overtime ?? (totalRemaining <= 0 && activeSegmentIndex === segments.length - 1);
  return {
    ...card,
    ...overrides,
    segments,
    durationSec: totalDuration,
    remainingSec: totalRemaining,
    activeSegmentIndex,
    remainingSecAtStart,
    running: isRunning && totalRemaining > 0,
    overtime,
  };
};

const upgradeLegacyCard = (card) => {
  if (!card) return card;
  if (Array.isArray(card.segments) && card.segments.length) {
    return deriveCardFromSegments({ ...card }, card.segments, {
      running: card.running,
      remainingSecAtStart: card.remainingSecAtStart,
      activeSegmentIndex: card.activeSegmentIndex,
      overtime: card.overtime,
    });
  }

  const baseDuration = sanitizeSegmentDuration(card.durationSec ?? card.remainingSec ?? 1500);
  const baseRemaining = clamp(Math.floor(card.remainingSec ?? baseDuration), 0, baseDuration);
  return deriveCardFromSegments({ ...card }, [
    {
      id: `${card.id || "card"}-seg-0`,
      durationSec: baseDuration,
      remainingSec: baseRemaining,
    },
  ], {
    running: card.running,
    remainingSecAtStart: card.remainingSecAtStart ?? baseRemaining,
    activeSegmentIndex: 0,
    overtime: card.overtime,
  });
};

const formatSegmentForInput = (sec) => {
  const minutes = Math.max((sec || 0) / 60, MIN_SEGMENT_SEC / 60);
  if (!Number.isFinite(minutes)) return "1";
  if (Number.isInteger(minutes)) return String(minutes);
  return minutes.toFixed(2).replace(/\.0+$/, "").replace(/0+$/, "").replace(/\.$/, "");
};

const segmentDraftsFromSegments = (segments) => {
  const src = segments && segments.length ? segments : [];
  if (!src.length) {
    return [{ id: `draft-${uid()}`, value: "25" }];
  }
  return src.map((seg) => ({ id: seg.id || `draft-${uid()}`, value: formatSegmentForInput(seg.durationSec ?? 1500) }));
};

function SegmentRowsEditor({ rows, errors, onChange, onRemove, palette, maxHeight = "", showIndex = true }) {
  const containerCls = maxHeight ? `space-y-2 ${maxHeight} overflow-y-auto pr-1` : "space-y-2";
  return (
    <div className={containerCls}>
      {rows.map((row, idx) => (
        <div key={row.id} className="space-y-1">
          <div className="flex items-center gap-2">
            {showIndex ? (
              <span className="text-[11px]" style={{ color: palette.subtext, minWidth: 18 }}>#{idx + 1}</span>
            ) : null}
            <input
              value={row.value}
              onChange={(e) => onChange(row.id, e.target.value)}
              placeholder="25m"
              className="flex-1 rounded-md px-2 py-1 text-xs outline-none"
              style={{ border: `1px solid ${palette.border}`, backgroundColor: "transparent", color: palette.text }}
            />
            {onRemove ? (
              <button
                type="button"
                className="rounded-md p-1"
                style={{ border: `1px solid ${palette.border}`, color: palette.subtext }}
                onClick={() => onRemove(row.id)}
                aria-label="Remove segment"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            ) : null}
          </div>
          {errors?.[row.id] ? (
            <p className="text-[10px]" style={{ color: palette.dangerText }}>{errors[row.id]}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// Parse time expressions embedded in a title string.
const DURATION_TOKEN_RE = /(?:\d{1,2}:\d{2})|(?:\d+(?:\.\d+)?\s*h(?:ours?)?(?:\s*\d+(?:\.\d+)?\s*m(?:in(?:ute)?s?)?)?)|(?:\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes))|(?:\b\d+(?:\.\d+)?\b)/gi;

function parseTimeFromTitle(rawTitle) {
  let title = rawTitle || "";
  if (!rawTitle) return { cleanTitle: title, durationSec: null, segments: [] };

  const matches = [];
  for (const match of rawTitle.matchAll(DURATION_TOKEN_RE)) {
    const token = match[0];
    const sec = parseDurationToSeconds(token);
    if (sec && sec >= MIN_SEGMENT_SEC) {
      matches.push({ token, sec });
    }
  }

  if (matches.length > 1) {
    matches.forEach(({ token }) => {
      title = title.replace(token, " ");
    });
    title = title.replace(/[()\[\]\-_,]+/g, " ").replace(/\s{2,}/g, " ").trim();
    const durations = matches.map((m) => m.sec);
    const total = durations.reduce((acc, sec) => acc + sec, 0);
    return { cleanTitle: title || rawTitle, durationSec: total, segments: durations };
  }

  if (matches.length === 1) {
    const [{ token, sec }] = matches;
    title = title.replace(token, " ");
    title = title.replace(/[()\[\]\-_,]+/g, " ").replace(/\s{2,}/g, " ").trim();
    return { cleanTitle: title || rawTitle, durationSec: sec, segments: [] };
  }

  const s = rawTitle.toLowerCase();
  let durationSec = null;

  // HH:MM
  let m = s.match(/\b(\d{1,2}):(\d{2})\b/);
  if (m) {
    const hh = parseInt(m[1], 10) || 0;
    const mm = parseInt(m[2], 10) || 0;
    if (mm >= 0 && mm < 60) {
      durationSec = hh * 3600 + mm * 60;
      title = title.replace(m[0], "");
    }
  }

  // 1h 20m / 1 hour 20 minutes
  if (durationSec == null) {
    m = s.match(/\b(?:(\d+(?:\.\d+)?)\s*h(?:ours?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)\b/);
    if (m && (m[1] || m[2])) {
      const h = m[1] ? parseFloat(m[1]) : 0;
      const min = m[2] ? parseFloat(m[2]) : 0;
      durationSec = Math.round(h * 3600 + min * 60);
      title = title.replace(m[0], "");
    }
  }

  // 30m / 2h / 45 minutes
  if (durationSec == null) {
    m = s.match(/\b(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/);
    if (m) {
      const n = parseFloat(m[1]);
      const u = m[2];
      durationSec = /^h/.test(u) ? Math.round(n * 3600) : Math.round(n * 60);
      title = title.replace(m[0], "");
    }
  }

  title = title.replace(/[()\[\]\-_,]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return { cleanTitle: title || rawTitle, durationSec, segments: [] };
}

// Parse free-form duration like 90, 25m, 1:30, 1h 20m, 2h
function parseDurationToSeconds(input) {
  const s = String(input ?? "").trim().toLowerCase();
  if (!s) return null;
  // HH:MM
  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = parseInt(m[1], 10) || 0;
    const min = parseInt(m[2], 10) || 0;
    if (min >= 0 && min < 60) return h * 3600 + min * 60;
  }
  // 1h 20m / 1 hour 20 minutes
  m = s.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)$/);
  if (m && (m[1] || m[2])) {
    const h = m[1] ? parseFloat(m[1]) : 0;
    const min = m[2] ? parseFloat(m[2]) : 0;
    return Math.round(h * 3600 + min * 60);
  }
  // 30m / 2h / 45 (default minutes if omitted)
  m = s.match(/^(\d+(?:\.\d+)?)(?:\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes))?$/);
  if (m) {
    const n = parseFloat(m[1]);
    const u = m[2] || "m";
    return /^h/.test(u) ? Math.round(n * 3600) : Math.round(n * 60);
  }
  return null;
}

// =====================
// Constants / Storage
// =====================
const DEFAULT_COLUMNS = [
  { id: "todo", name: "To Do" },
  { id: "doing", name: "In Progress" },
  { id: "done", name: "Done" },
];

const STORAGE_KEY = "kanban-timer-board:v1";
const THEME_KEY = "kanban-theme";
const SOUND_KEY = "kanban-sound"; // { enabled, type, volume, loop }

// =====================
// Hooks & Persistence
// =====================
function useNowTicker(runningCount) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!runningCount) return; // no running timers, no interval
    const i = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(i);
  }, [runningCount]);
  return tick; // value only used to trigger renders
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

const loadTheme = () => {
  try { return localStorage.getItem(THEME_KEY) || "dark"; } catch { return "dark"; }
};
const saveTheme = (t) => { try { localStorage.setItem(THEME_KEY, t); } catch {} };

const DEFAULT_SOUND = { enabled: true, type: "ping", volume: 0.7, loop: true };
const loadSound = () => {
  try {
    const raw = localStorage.getItem(SOUND_KEY);
    if (!raw) return DEFAULT_SOUND;
    return { ...DEFAULT_SOUND, ...JSON.parse(raw) };
  } catch { return DEFAULT_SOUND; }
};
const saveSound = (s) => { try { localStorage.setItem(SOUND_KEY, JSON.stringify(s)); } catch {} };

// =====================
// Audio (WebAudio chimes)
// =====================
function createAudioCtx() {
  const ACtx = window.AudioContext || window.webkitAudioContext;
  if (!ACtx) return null;
  return new ACtx();
}

function playChime(ctxRef, { type = "ping", volume = 0.7 } = {}) {
  const ctx = ctxRef.current;
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = clamp(volume, 0, 1);
  master.connect(ctx.destination);

  const env = (node, a = 0.002, d = 0.25) => {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(1.0, t0 + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  };

  const tone = (freq, dur = 0.3, type = "sine", detune = 0) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (detune) o.detune.setValueAtTime(detune, t0);
    env(g, 0.002, dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  };

  switch (type) {
    case "bell":
      tone(660, 0.8, "sine");
      tone(1320, 0.9, "sine", -5);
      break;
    case "alarm":
      tone(880, 0.18, "square");
      setTimeout(() => { if (ctx.state !== "closed") tone(880, 0.18, "square"); }, 220);
      break;
    case "wood":
      tone(520, 0.12, "triangle");
      tone(780, 0.08, "triangle");
      break;
    case "ping":
    default:
      tone(880, 0.25, "sine");
      break;
  }
}

// =====================
// Main Component
// =====================
export default function KanbanTimerBoard() {
  const [columns] = useState(DEFAULT_COLUMNS);
  const [cardsByCol, setCardsByCol] = useState(() => {
    const stored = loadState()?.cardsByCol || {};
    const initial = {};
    DEFAULT_COLUMNS.forEach((col) => {
      initial[col.id] = (stored[col.id] || []).map(upgradeLegacyCard);
    });
    return initial;
  });

  const [filter, setFilter] = useState("");
  const [showNewCard, setShowNewCard] = useState(false);
  const [newCardCol, setNewCardCol] = useState("todo");
  const [editCard, setEditCard] = useState(null); // { colId, card }
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Theme & sound
  const [theme, setTheme] = useState(loadTheme()); // 'dark' | 'light'
  const [sound, setSound] = useState(loadSound()); // { enabled, type, volume, loop }
  useEffect(() => saveTheme(theme), [theme]);
  useEffect(() => saveSound(sound), [sound]);

  // Derived palette
  const isDark = theme === "dark";
  const palette = useMemo(() => ({
    bg: isDark ? "#191919" : "#fafafa",
    headerBg: isDark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.7)",
    surface: isDark ? "#1f1f1f" : "#ffffff",
    card: isDark ? "#202020" : "#ffffff",
    border: isDark ? "#2b2b2b" : "#e5e7eb",
    text: isDark ? "#e5e5e5" : "#111827",
    subtext: isDark ? "#a3a3a3" : "#6b7280",
    badge: isDark ? "#262626" : "#f3f4f6",
    barBg: isDark ? "#262626" : "#e5e7eb",
    barFill: isDark ? "#e5e5e5" : "#111827",
    barOutline: isDark ? "#4b5563" : "#d1d5db",
    dangerBg: isDark ? "#7f1d1d" : "#fee2e2",
    dangerText: isDark ? "#fecaca" : "#b91c1c",
  }), [isDark]);

  // Audio context (armed on first user interaction)
  const audioRef = useRef(null);
  const [chimeActive, setChimeActive] = useState(false);
  const loopRef = useRef({ id: null });
  const startLoopingChime = () => {
    if (loopRef.current.id) return;
    setChimeActive(true);
    playChime(audioRef, { type: sound.type, volume: sound.volume });
    loopRef.current.id = setInterval(() => playChime(audioRef, { type: sound.type, volume: sound.volume }), 1200);
  };
  const stopLoopingChime = () => {
    if (loopRef.current.id) { clearInterval(loopRef.current.id); loopRef.current.id = null; }
    setChimeActive(false);
  };
  useEffect(() => {
    const arm = () => {
      if (!audioRef.current) audioRef.current = createAudioCtx();
      audioRef.current?.resume?.();
      window.removeEventListener("pointerdown", arm);
    };
    window.addEventListener("pointerdown", arm, { once: true });
    return () => window.removeEventListener("pointerdown", arm);
  }, []);
  useEffect(() => { if (!sound.enabled) stopLoopingChime(); }, [sound.enabled]);

  // Count running for ticker
  const runningCount = useMemo(() => Object.values(cardsByCol).flat().filter(c => c.running).length, [cardsByCol]);
  const tick = useNowTicker(runningCount);

  // Update derived remaining for running cards
  const recompute = (card) => {
    const baseSegments = card.segments?.length
      ? card.segments
      : [
          {
            id: `${card.id || "card"}-seg-0`,
            durationSec: card.durationSec ?? card.remainingSec ?? 1500,
            remainingSec: card.remainingSec ?? card.durationSec ?? 1500,
          },
        ];
    const normalized = deriveCardFromSegments(
      { ...card },
      baseSegments,
      {
        running: card.running,
        remainingSecAtStart: card.remainingSecAtStart,
        activeSegmentIndex: card.activeSegmentIndex,
        overtime: card.overtime,
      }
    );

    const activeIdx = normalized.activeSegmentIndex;
    const activeSegment = normalized.segments[activeIdx] || normalized.segments[normalized.segments.length - 1] || { remainingSec: 0, durationSec: 1 };

    if (!normalized.running || !normalized.lastStartTs) {
      return { ...normalized, computedActiveRemaining: activeSegment.remainingSec };
    }

    const now = Date.now();
    const elapsed = (now - normalized.lastStartTs) / 1000;
    const baseRemaining = normalized.remainingSecAtStart ?? activeSegment.remainingSec;
    const computedRemaining = baseRemaining - elapsed;
    const updatedSegments = normalized.segments.map((seg, idx) => {
      if (idx !== activeIdx) return seg;
      const clamped = clamp(Math.max(computedRemaining, 0), 0, seg.durationSec);
      return { ...seg, remainingSec: clamped };
    });
    const totalRemaining = updatedSegments.reduce((sum, seg) => sum + seg.remainingSec, 0);
    return {
      ...normalized,
      segments: updatedSegments,
      remainingSec: totalRemaining,
      computedActiveRemaining: computedRemaining,
      overtime: computedRemaining <= 0 && activeIdx === updatedSegments.length - 1,
    };
  };

  const materialized = useMemo(() => {
    const out = {};
    for (const col of columns) out[col.id] = (cardsByCol[col.id] || []).map(recompute);
    return out;
  }, [cardsByCol, columns, tick]);

  // Complete cards auto-move to top of Done + chime
  useEffect(() => {
    const now = Date.now();
    let chimeNeeded = false;

    setCardsByCol(prev => {
      let mutated = false;
      const next = {};
      const doneIncoming = [];

      for (const col of columns) {
        const prevList = prev[col.id] || [];

        if (col.id === "done") {
          next[col.id] = prevList;
          continue;
        }

        let colChanged = false;
        const newList = [];

        for (const card of prevList) {
          if (!card.running || !card.lastStartTs) {
            newList.push(card);
            continue;
          }

          const elapsed = Math.floor((now - card.lastStartTs) / 1000);
          const remainingActive = (card.remainingSecAtStart ?? 0) - elapsed;

          if (remainingActive > 0) {
            newList.push(card);
            continue;
          }

          colChanged = true;
          mutated = true;
          chimeNeeded = true;

          const segments = (card.segments || []).map((seg, idx) =>
            idx === card.activeSegmentIndex ? { ...seg, remainingSec: 0 } : seg
          );

          const totalRemaining = segments.reduce((sum, seg) => sum + (seg.remainingSec ?? 0), 0);

          if (totalRemaining <= 0) {
            const completed = deriveCardFromSegments(
              { ...card, running: false, lastStartTs: null },
              segments.length ? segments : [
                {
                  id: `${card.id || "card"}-seg-0`,
                  durationSec: card.durationSec ?? MIN_SEGMENT_SEC,
                  remainingSec: 0,
                },
              ],
              {
                remainingSecAtStart: 0,
                activeSegmentIndex: Math.max(segments.length - 1, 0),
                overtime: true,
              }
            );
            doneIncoming.push({ from: col.id, card: completed });
          } else {
            const nextActiveIndex = findNextActiveSegment(segments);
            const paused = deriveCardFromSegments(
              { ...card, running: false, lastStartTs: null },
              segments,
              {
                remainingSecAtStart: segments[nextActiveIndex]?.remainingSec ?? 0,
                activeSegmentIndex: nextActiveIndex,
                overtime: false,
              }
            );
            newList.push(paused);
          }
        }

        if (colChanged) {
          next[col.id] = newList;
        } else {
          next[col.id] = prevList;
        }
      }

      if (!mutated) return prev;

      const doneList = [...(next.done || prev.done || [])];
      doneIncoming.forEach(({ card }) => doneList.unshift(card));
      next.done = doneList;
      return next;
    });

    if (chimeNeeded && sound.enabled) {
      if (sound.loop) startLoopingChime(); else playChime(audioRef, { type: sound.type, volume: sound.volume });
    }
  }, [tick, columns, sound]);

  // Persist board state
  useEffect(() => { saveState({ cardsByCol }); }, [cardsByCol]);

  // =====================
  // Actions
  // =====================
  const addCard = (colId, payload) => {
    const id = uid();
    const durations = coerceSegmentDurations(payload.segments, payload.durationSec || 1500);
    const segments = durations.map((sec, idx) => ({
      id: `${id}-seg-${idx}`,
      durationSec: sec,
      remainingSec: sec,
    }));
    const baseCard = {
      id,
      title: payload.title?.trim() || "Untitled",
      notes: payload.notes?.trim() || "",
      running: false,
      lastStartTs: null,
      overtime: false,
      createdAt: Date.now(),
    };
    const card = deriveCardFromSegments(baseCard, segments, {
      remainingSecAtStart: segments[0]?.remainingSec ?? durations[0],
      activeSegmentIndex: 0,
    });
    setCardsByCol(prev => ({ ...prev, [colId]: [...(prev[colId] || []), card] }));
  };

  const updateCard = (colId, cardId, patch) => {
    const updater = typeof patch === "function" ? patch : (card) => ({ ...card, ...patch });
    setCardsByCol(prev => ({
      ...prev,
      [colId]: (prev[colId] || []).map((c) => {
        if (c.id !== cardId) return c;
        const candidate = updater(c);
        if (candidate.segments) {
          return deriveCardFromSegments({ ...candidate }, candidate.segments, candidate);
        }
        return candidate;
      }),
    }));
  };

  const removeCard = (colId, cardId) => {
    setCardsByCol(prev => ({ ...prev, [colId]: (prev[colId] || []).filter(c => c.id !== cardId) }));
  };

  const moveCard = (fromCol, toCol, cardId, index = null) => {
    if (fromCol === toCol) return;
    setCardsByCol(prev => {
      const src = [...(prev[fromCol] || [])];
      const idx = src.findIndex(c => c.id === cardId);
      if (idx === -1) return prev;
      const [card] = src.splice(idx, 1);
      const dest = [...(prev[toCol] || [])];
      if (index === null || index < 0 || index > dest.length) dest.push(card); else dest.splice(index, 0, card);
      return { ...prev, [fromCol]: src, [toCol]: dest };
    });
  };

  const startTimer = (colId, card) => {
    const now = Date.now();
    updateCard(colId, card.id, (current) => {
      if (current.running) return current;
      const segments = (current.segments && current.segments.length
        ? current.segments
        : [
            {
              id: `${current.id || card.id}-seg-0`,
              durationSec: current.durationSec ?? current.remainingSec ?? 1500,
              remainingSec: current.remainingSec ?? current.durationSec ?? 1500,
            },
          ]
      ).map((seg) => ({ ...seg }));
      const activeIndex = findNextActiveSegment(segments);
      const activeSegment = segments[activeIndex];
      if (!activeSegment || activeSegment.remainingSec <= 0) {
        return { ...current, running: false, lastStartTs: null };
      }
      return {
        ...current,
        segments,
        running: true,
        lastStartTs: now,
        remainingSecAtStart: activeSegment.remainingSec,
        activeSegmentIndex: activeIndex,
        overtime: false,
      };
    });
  };

  const pauseTimer = (colId, card) => {
    if (!card.running) return;
    const now = Date.now();
    updateCard(colId, card.id, (current) => {
      if (!current.running || !current.lastStartTs) return current;
      const elapsed = Math.floor((now - current.lastStartTs) / 1000);
      const activeIndex = current.activeSegmentIndex ?? findNextActiveSegment(current.segments || []);
      const segments = (current.segments && current.segments.length
        ? current.segments
        : [
            {
              id: `${current.id || card.id}-seg-0`,
              durationSec: current.durationSec ?? current.remainingSec ?? 1500,
              remainingSec: current.remainingSec ?? current.durationSec ?? 1500,
            },
          ]
      ).map((seg) => ({ ...seg }));
      const activeSegment = segments[activeIndex];
      if (!activeSegment) {
        return {
          ...current,
          segments,
          running: false,
          lastStartTs: null,
          remainingSec: segments.reduce((sum, seg) => sum + (seg.remainingSec ?? seg.durationSec ?? 0), 0),
          remainingSecAtStart: 0,
          activeSegmentIndex: findNextActiveSegment(segments),
          overtime: false,
        };
      }
      const baseRemaining = current.remainingSecAtStart ?? activeSegment.remainingSec;
      const remaining = clamp(baseRemaining - elapsed, 0, activeSegment.durationSec);
      segments[activeIndex] = { ...activeSegment, remainingSec: remaining };
      const nextActiveIndex = findNextActiveSegment(segments);
      const totalRemaining = segments.reduce((sum, seg) => sum + (seg.remainingSec ?? 0), 0);
      return {
        ...current,
        segments,
        running: false,
        lastStartTs: null,
        remainingSec: totalRemaining,
        remainingSecAtStart: segments[nextActiveIndex]?.remainingSec ?? 0,
        activeSegmentIndex: nextActiveIndex,
        overtime: false,
      };
    });
  };

  const resetTimer = (colId, card) => {
    updateCard(colId, card.id, (current) => {
      const segments = (current.segments && current.segments.length
        ? current.segments
        : [
            {
              id: `${current.id || card.id}-seg-0`,
              durationSec: current.durationSec ?? current.remainingSec ?? 1500,
              remainingSec: current.remainingSec ?? current.durationSec ?? 1500,
            },
          ]
      ).map((seg) => ({ ...seg, remainingSec: seg.durationSec }));
      return {
        ...current,
        segments,
        running: false,
        lastStartTs: null,
        remainingSecAtStart: segments[0]?.remainingSec ?? 0,
        activeSegmentIndex: 0,
        overtime: false,
      };
    });
  };

  const setCardSegments = (colId, card, segmentDurations) => {
    const durations = coerceSegmentDurations(segmentDurations, card.durationSec || segmentDurations?.[0] || 1500);
    updateCard(colId, card.id, (current) => {
      const existing = current.segments || [];
      const segments = durations.map((sec, idx) => {
        const prevSeg = existing[idx];
        const remaining = prevSeg ? clamp(Math.floor(prevSeg.remainingSec ?? sec), 0, sec) : sec;
        return {
          id: prevSeg?.id || `${current.id || card.id}-seg-${idx}-${uid()}`,
          durationSec: sec,
          remainingSec: remaining,
        };
      });
      const nextActiveIndex = findNextActiveSegment(segments);
      return {
        ...current,
        segments,
        running: false,
        lastStartTs: null,
        remainingSecAtStart: segments[nextActiveIndex]?.remainingSec ?? 0,
        activeSegmentIndex: nextActiveIndex,
        overtime: false,
      };
    });
  };

  const setCardProgress = (colId, card, remainingBySegment) => {
    updateCard(colId, card.id, (current) => {
      const existing = current.segments || [];
      const segments = existing.map((seg, idx) => {
        const nextRemaining = remainingBySegment?.[idx];
        const safeRemaining = nextRemaining == null ? seg.remainingSec : clamp(Math.floor(nextRemaining), 0, seg.durationSec);
        return { ...seg, remainingSec: safeRemaining };
      });
      const nextActiveIndex = findNextActiveSegment(segments);
      const overtime = segments.every((seg) => (seg.remainingSec ?? 0) <= 0);
      return {
        ...current,
        segments,
        running: false,
        lastStartTs: null,
        remainingSecAtStart: segments[nextActiveIndex]?.remainingSec ?? 0,
        activeSegmentIndex: nextActiveIndex,
        overtime,
      };
    });
  };

  const doClearAll = () => { setCardsByCol({ todo: [], doing: [], done: [] }); setConfirmClearOpen(false); };

  // Start button from To Do auto-moves to top of In Progress and starts
  const handleStart = (colId, card) => {
    if (colId !== "todo") { startTimer(colId, card); return; }
    setCardsByCol(prev => {
      const src = [...(prev["todo"] || [])];
      const idx = src.findIndex(c => c.id === card.id);
      if (idx === -1) return prev;
      const [item] = src.splice(idx, 1);
      const doing = [...(prev["doing"] || [])];
      const now = Date.now();
      const segments = (item.segments && item.segments.length
        ? item.segments
        : [
            {
              id: `${item.id}-seg-0`,
              durationSec: item.durationSec ?? item.remainingSec ?? 1500,
              remainingSec: item.remainingSec ?? item.durationSec ?? 1500,
            },
          ]
      ).map((seg) => ({ ...seg }));
      const activeIndex = findNextActiveSegment(segments);
      const activeSegment = segments[activeIndex];
      const runningCard = activeSegment && activeSegment.remainingSec > 0
        ? deriveCardFromSegments(
            { ...item, running: true, lastStartTs: now },
            segments,
            {
              running: true,
              lastStartTs: now,
              remainingSecAtStart: activeSegment.remainingSec,
              activeSegmentIndex: activeIndex,
              overtime: false,
            }
          )
        : deriveCardFromSegments(
            { ...item, running: false, lastStartTs: null },
            segments,
            {
              running: false,
              lastStartTs: null,
              remainingSecAtStart: segments[activeIndex]?.remainingSec ?? 0,
              activeSegmentIndex: activeIndex,
            }
          );
      doing.unshift(runningCard);
      return { ...prev, todo: src, doing };
    });
  };

  // Search filter
  const filtered = useMemo(() => {
    if (!filter.trim()) return materialized;
    const q = filter.trim().toLowerCase();
    const out = {};
    for (const col of columns) {
      out[col.id] = (materialized[col.id] || []).filter(
        (c) => c.title.toLowerCase().includes(q) || c.notes.toLowerCase().includes(q)
      );
    }
    return out;
  }, [filter, materialized, columns]);

  // =====================
  // Render
  // =====================
  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: palette.bg, color: palette.text }}>
      <Header
        filter={filter}
        setFilter={setFilter}
        onAdd={() => setShowNewCard(true)}
        onClear={() => setConfirmClearOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        runningCount={runningCount}
        palette={palette}
        theme={theme}
        chimeActive={chimeActive}
        onStopChime={stopLoopingChime}
      />

      <div className="mx-auto max-w-7xl p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {columns.map((col) => (
            <Column
              key={col.id}
              column={col}
              cards={filtered[col.id] || []}
              onDropCard={(cardId, fromCol, insertIndex) => moveCard(fromCol, col.id, cardId, insertIndex)}
              onAddCard={() => { setNewCardCol(col.id); setShowNewCard(true); }}
              renderCard={(card, index) => (
                <Card
                  key={card.id}
                  card={card}
                  colId={col.id}
                  onStart={() => handleStart(col.id, card)}
                  onPause={() => pauseTimer(col.id, card)}
                  onReset={() => resetTimer(col.id, card)}
                  onRemove={() => removeCard(col.id, card.id)}
                  onEdit={() => setEditCard({ colId: col.id, card })}
                  onSetSegments={(segments) => setCardSegments(col.id, card, segments)}
                  onUpdateProgress={(arr) => setCardProgress(col.id, card, arr)}
                  index={index}
                  palette={palette}
                />
              )}
              palette={palette}
            />
          ))}
        </div>
      </div>

      {showNewCard && (
        <NewCardModal
          defaultCol={newCardCol}
          onClose={() => setShowNewCard(false)}
          onCreate={(colId, payload) => { addCard(colId, payload); setShowNewCard(false); }}
          columns={columns}
          palette={palette}
        />
      )}

      {editCard && (
        <EditCardModal
          card={editCard.card}
          onClose={() => setEditCard(null)}
          onSave={(patch) => { updateCard(editCard.colId, editCard.card.id, patch); setEditCard(null); }}
          palette={palette}
        />
      )}

      {confirmClearOpen && (
        <Modal title="Clear all tasks?" onClose={() => setConfirmClearOpen(false)} palette={palette}>
          <div className="space-y-3">
            <p className="text-sm" style={{ color: palette.subtext }}>This will remove every card in <em>To Do</em>, <em>In Progress</em>, and <em>Done</em>. This action cannot be undone.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setConfirmClearOpen(false)} className="rounded-xl px-3 py-2 text-sm" style={{ border: `1px solid ${palette.border}` }}>Cancel</button>
              <button onClick={doClearAll} className="rounded-xl px-3 py-2 text-sm font-medium" style={{ backgroundColor: palette.dangerBg, color: palette.dangerText }}>Clear all</button>
            </div>
          </div>
        </Modal>
      )}

      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          theme={theme}
          setTheme={setTheme}
          sound={sound}
          setSound={setSound}
          onTest={() => playChime(audioRef, { type: sound.type, volume: sound.volume })}
          palette={palette}
          chimeActive={chimeActive}
          onStopChime={stopLoopingChime}
        />
      )}
    </div>
  );
}

// =====================
// Subcomponents
// =====================
function Header({ filter, setFilter, onAdd, onClear, onOpenSettings, runningCount, palette, theme, chimeActive, onStopChime }) {
  return (
    <div className="sticky top-0 z-10 w-full border-b backdrop-blur" style={{ backgroundColor: palette.headerBg, borderColor: palette.border }}>
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: palette.text }}>Kanban Timers</h1>
        <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: palette.badge, color: palette.subtext }}>{runningCount} running</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter tasks..."
              className="w-64 rounded-xl px-3 py-2 text-sm outline-none ring-0"
              style={{ backgroundColor: theme === 'dark' ? '#1f1f1f' : '#ffffff', border: `1px solid ${palette.border}`, color: palette.text }}
            />
          </div>
          <button onClick={onAdd} className="rounded-xl px-3 py-2 text-sm font-medium" style={{ backgroundColor: palette.text, color: palette.bg }}>New</button>
          <button onClick={onClear} className="rounded-xl px-3 py-2 text-sm" style={{ border: `1px solid ${palette.border}` }}>Clear</button>
          {chimeActive && (
            <button onClick={onStopChime} title="Stop chime" className="rounded-md p-2" style={{ border: `1px solid ${palette.border}` }}>
              <VolumeX className="h-4 w-4" />
            </button>
          )}
          <button onClick={onOpenSettings} title="Settings" className="rounded-md p-2" style={{ border: `1px solid ${palette.border}` }}>
            <SettingsIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Column({ column, cards, onDropCard, onAddCard, renderCard, palette }) {
  const handleDragOver = (e) => { e.preventDefault(); e.currentTarget.classList.add("ring", "ring-neutral-700"); };
  const handleDragLeave = (e) => { e.currentTarget.classList.remove("ring", "ring-neutral-700"); };
  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove("ring", "ring-neutral-700");
    const payload = JSON.parse(e.dataTransfer.getData("application/x-card"));
    const list = e.currentTarget.querySelector("[data-list]");
    const children = Array.from(list.children);
    let insertIndex = children.length;
    const y = e.clientY;
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) { insertIndex = i; break; }
    }
    onDropCard(payload.cardId, payload.fromCol, insertIndex);
  };

  // Total planned time for this column
  const totalSecs = (cards || []).reduce((acc, c) => acc + (c?.durationSec || 0), 0);

  return (
    <section
      className="flex min-h-[60vh] flex-col rounded-2xl p-3 shadow-sm border"
      style={{ backgroundColor: palette.surface, borderColor: palette.border }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight flex items-center" style={{ color: palette.text }}>
          {column.name}
          <span className="ml-2 rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: palette.badge, color: palette.subtext }}>{cards.length}</span>
          <span className="ml-2 rounded-full px-2 py-0.5 text-xs tabular-nums" title="Total planned time" style={{ backgroundColor: palette.badge, color: palette.text }}>
            {secsToHHMM(totalSecs)}
          </span>
        </h2>
        <button onClick={onAddCard} className="rounded-lg px-2 py-1 text-xs" style={{ border: `1px solid ${palette.border}` }}>Add</button>
      </header>
      <div data-list className="flex flex-1 flex-col gap-3">
        {cards.map((card, i) => renderCard(card, i))}
      </div>
    </section>
  );
}

function SegmentLimitEditor({ card, onSetSegments, palette }) {
  const containerRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(() => segmentDraftsFromSegments(card.segments));
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!editing) {
      setRows(segmentDraftsFromSegments(card.segments));
      setErrors({});
    }
  }, [card, editing]);

  useEffect(() => {
    if (!editing) return;
    const handler = (e) => {
      if (!containerRef.current || containerRef.current.contains(e.target)) return;
      setEditing(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [editing]);

  const activeIdx = card.activeSegmentIndex ?? findNextActiveSegment(card.segments || []);
  const totalLimit = card.durationSec ?? (card.segments || []).reduce((sum, seg) => sum + (seg.durationSec ?? 0), 0);
  const currentLimit = card.segments?.[activeIdx]?.durationSec ?? totalLimit;

  const handleSave = () => {
    const parsed = [];
    const nextErrors = {};
    rows.forEach((row) => {
      const sec = parseDurationToSeconds(row.value);
      if (!sec || sec < MIN_SEGMENT_SEC || sec > MAX_SEGMENT_SEC) {
        nextErrors[row.id] = "Enter 5s–24h";
      } else {
        parsed.push(sec);
      }
    });
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    onSetSegments(parsed);
    setEditing(false);
  };

  const handleAddRow = () => {
    setRows((prev) => [...prev, { id: `draft-${uid()}`, value: prev.length ? prev[prev.length - 1].value : "25" }]);
  };

  const handleRemoveRow = (id) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="rounded px-2 py-0.5 text-xs tabular-nums"
        style={{ color: palette.subtext, backgroundColor: "transparent", border: `1px dashed ${palette.border}` }}
        onClick={() => setEditing((v) => !v)}
        title="Edit segment durations"
      >
        {`${secsToHHMM(currentLimit || 0)}/${secsToHHMM(totalLimit || 0)}`}
      </button>

      {editing && (
        <div
          className="absolute z-30 mt-2 w-64 space-y-3 rounded-xl p-3"
          style={{ backgroundColor: palette.surface, border: `1px solid ${palette.border}`, boxShadow: "0 12px 24px rgba(0,0,0,0.25)" }}
        >
          <h4 className="text-xs font-semibold" style={{ color: palette.text }}>Segments</h4>
          <SegmentRowsEditor
            rows={rows}
            errors={errors}
            onChange={(id, value) => {
              setRows((prev) => prev.map((r) => (r.id === id ? { ...r, value } : r)));
              setErrors((prev) => ({ ...prev, [id]: undefined }));
            }}
            onRemove={rows.length > 1 ? (id) => handleRemoveRow(id) : null}
            palette={palette}
            maxHeight="max-h-60"
          />
          <button
            type="button"
            className="w-full rounded-md px-2 py-1 text-xs"
            style={{ border: `1px dashed ${palette.border}`, color: palette.subtext }}
            onClick={handleAddRow}
          >
            Add segment
          </button>
          <div className="flex justify-end gap-2 text-xs">
            <button type="button" className="rounded-md px-2 py-1" style={{ border: `1px solid ${palette.border}`, color: palette.subtext }} onClick={() => setEditing(false)}>Cancel</button>
            <button type="button" className="rounded-md px-2 py-1 font-medium" style={{ backgroundColor: palette.text, color: palette.bg }} onClick={handleSave}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ card, colId, onStart, onPause, onReset, onRemove, onEdit, onSetSegments, onUpdateProgress, index, palette }) {
  const ref = useRef(null);
  const segments = (card.segments && card.segments.length ? card.segments : [
    {
      id: `${card.id}-seg-0`,
      durationSec: card.durationSec ?? card.remainingSec ?? MIN_SEGMENT_SEC,
      remainingSec: card.remainingSec ?? card.durationSec ?? MIN_SEGMENT_SEC,
    },
  ]).map((seg) => ({ ...seg }));
  const totalDuration = segments.reduce((sum, seg) => sum + (seg.durationSec ?? 0), 0) || 1;
  const totalRemaining = segments.reduce((sum, seg) => sum + (seg.remainingSec ?? 0), 0);
  const baseIsOver = totalRemaining <= 0;
  const activeIdx = card.activeSegmentIndex ?? findNextActiveSegment(segments);
  const activeRemaining = (() => {
    const base = card.computedActiveRemaining ?? segments[activeIdx]?.remainingSec ?? 0;
    return Math.max(base, 0);
  })();
  const barRef = useRef(null);
  const dragPointerIdRef = useRef(null);
  const [dragState, setDragState] = useState({ active: false, ratio: 0, displaySec: 0 });

  const computeRemainingFromRatio = (ratio) => {
    let spent = totalDuration * clamp(ratio, 0, 1);
    return segments.map((seg) => {
      if (spent <= 0) return seg.durationSec;
      if (spent >= seg.durationSec) {
        spent -= seg.durationSec;
        return 0;
      }
      const remaining = seg.durationSec - spent;
      spent = 0;
      return remaining;
    });
  };

  const getRatioFromEvent = (event) => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    return clamp(ratio, 0, 1);
  };

  const updateDrag = (ratio) => {
    setDragState({ active: true, ratio, displaySec: Math.max(totalDuration - ratio * totalDuration, 0) });
  };

  const handlePointerDown = (event) => {
    if (!onUpdateProgress) return;
    event.preventDefault();
    event.stopPropagation();
    const ratio = getRatioFromEvent(event);
    dragPointerIdRef.current = event.pointerId;
    barRef.current?.setPointerCapture?.(event.pointerId);
    updateDrag(ratio);
  };

  const handlePointerMove = (event) => {
    if (dragPointerIdRef.current !== event.pointerId) return;
    const ratio = getRatioFromEvent(event);
    updateDrag(ratio);
  };

  const commitDrag = (ratio) => {
    if (!onUpdateProgress) return;
    const remainingArray = computeRemainingFromRatio(ratio);
    onUpdateProgress(remainingArray);
  };

  const resetDragState = () => {
    dragPointerIdRef.current = null;
    setDragState({ active: false, ratio: 0, displaySec: 0 });
  };

  const handlePointerUp = (event) => {
    if (dragPointerIdRef.current !== event.pointerId) return;
    const ratio = getRatioFromEvent(event);
    barRef.current?.releasePointerCapture?.(event.pointerId);
    commitDrag(ratio);
    resetDragState();
  };

  const handlePointerCancel = (event) => {
    if (dragPointerIdRef.current !== event.pointerId) return;
    barRef.current?.releasePointerCapture?.(event.pointerId);
    resetDragState();
  };

  const previewRemainings = dragState.active ? computeRemainingFromRatio(dragState.ratio) : null;

  const visualProgressList = dragState.active
    ? segments.map((seg, idx) => {
        const rem = previewRemainings[idx];
        return seg.durationSec ? clamp(1 - rem / seg.durationSec, 0, 1) : 0;
      })
    : segments.map((seg) => {
        const rem = seg.remainingSec ?? 0;
        return seg.durationSec ? clamp(1 - rem / seg.durationSec, 0, 1) : 0;
      });

  const visualSegmentsForIndex = dragState.active
    ? segments.map((seg, idx) => ({ ...seg, remainingSec: previewRemainings[idx] }))
    : segments;

  const visualActiveIndex = findNextActiveSegment(visualSegmentsForIndex);
  const visualActiveRemaining = dragState.active ? previewRemainings[visualActiveIndex] ?? 0 : activeRemaining;
  const visualTotalRemaining = dragState.active
    ? previewRemainings.reduce((sum, val) => sum + val, 0)
    : card.remainingSec ?? totalRemaining;
  const isOver = dragState.active ? visualTotalRemaining <= 0 : baseIsOver;

  const onDragStart = (e) => {
    e.dataTransfer.setData("application/x-card", JSON.stringify({ cardId: card.id, fromCol: colId, fromIndex: index }));
    e.dataTransfer.effectAllowed = "move";
    ref.current?.classList.add("opacity-60");
  };
  const onDragEnd = () => ref.current?.classList.remove("opacity-60");

  return (
    <article
      ref={ref}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group rounded-xl p-3 shadow-sm transition ${isOver ? "ring-1" : ""}`}
      style={{ backgroundColor: palette.card, border: `1px solid ${palette.border}` }}
    >
      <div className="mb-2 flex items-start gap-2">
        <div className="flex-1">
          <h3 className="text-sm font-semibold" style={{ color: palette.text }}>{card.title}</h3>
          {card.notes ? (
            <p className="mt-1 text-xs whitespace-pre-wrap" style={{ color: palette.subtext }}>{card.notes}</p>
          ) : null}
        </div>
        <button onClick={onRemove} title="Delete" className="rounded-md p-1" style={{ color: palette.subtext }}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-2">
        <div
          ref={barRef}
          draggable={false}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          className="relative flex h-2 w-full cursor-ew-resize items-stretch gap-[2px] select-none"
        >
          {dragState.active && (
            <>
              <div
                className="pointer-events-none absolute -top-6 rounded-full px-2 py-1 text-[10px] font-medium"
                style={{
                  left: `${dragState.ratio * 100}%`,
                  transform: 'translateX(-50%)',
                  backgroundColor: palette.surface,
                  border: `1px solid ${palette.border}`,
                  color: palette.text,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
                }}
              >
                {secsToHMS(Math.round(dragState.displaySec))}
              </div>
              <div
                className="pointer-events-none absolute inset-y-[-4px] w-px"
                style={{
                  left: `${dragState.ratio * 100}%`,
                  transform: 'translateX(-0.5px)',
                  backgroundColor: palette.text,
                  opacity: 0.6,
                }}
              />
            </>
          )}
          {segments.map((seg, idx) => {
            const progress = visualProgressList[idx] ?? 0;
            const isActive = idx === visualActiveIndex;
            return (
              <div
                key={seg.id || `${card.id}-seg-${idx}`}
                className="relative flex-1 overflow-hidden rounded-full"
                style={{
                  backgroundColor: palette.barBg,
                  flexGrow: seg.durationSec || 1,
                  boxShadow: isActive ? `0 0 0 1px ${palette.barOutline} inset` : "none",
                }}
              >
                <div
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${progress * 100}%`,
                    backgroundColor: isOver ? '#fda4af' : palette.barFill,
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex items-center justify-between text-xs" style={{ color: palette.subtext }}>
          <SegmentLimitEditor card={card} onSetSegments={onSetSegments} palette={palette} />
          <span className={`${isOver ? "font-semibold" : ""}`} style={{ color: isOver ? '#b91c1c' : palette.subtext }}>
            {isOver
              ? `Over: ${secsToHMS(Math.abs(visualTotalRemaining ?? 0))}`
              : `Left: ${secsToHMS(Math.max(visualActiveRemaining, 0))}/${secsToHMS(Math.max(visualTotalRemaining, 0))}`}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-nowrap">
        {card.running ? (
          <button onClick={onPause} title="Pause" aria-label="Pause" className="inline-flex h-8 w-8 items-center justify-center rounded-md" style={{ border: `1px solid ${palette.border}` }}>
            <Pause className="h-4 w-4" />
          </button>
        ) : (
          <button onClick={onStart} title="Start" aria-label="Start" className="inline-flex h-8 w-8 items-center justify-center rounded-md" style={{ border: `1px solid ${palette.border}` }}>
            <Play className="h-4 w-4" />
          </button>
        )}
        <button onClick={onReset} title="Reset" aria-label="Reset" className="inline-flex h-8 w-8 items-center justify-center rounded-md" style={{ border: `1px solid ${palette.border}` }}>
          <RotateCcw className="h-4 w-4" />
        </button>
        <button onClick={onEdit} title="Edit" aria-label="Edit" className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md" style={{ border: `1px solid ${palette.border}` }}>
          <Pencil className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}

function NewCardModal({ defaultCol, onClose, onCreate, columns, palette }) {
  const [colId, setColId] = useState(defaultCol);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [limitInput, setLimitInput] = useState("25");
  const [useSegments, setUseSegments] = useState(false);
  const [segmentRows, setSegmentRows] = useState(() => segmentDraftsFromSegments([]));
  const [segmentErrors, setSegmentErrors] = useState({});

  useEffect(() => {
    if (!useSegments) setSegmentErrors({});
  }, [useSegments]);

  const handleSegmentChange = (id, value) => {
    setSegmentRows((prev) => prev.map((row) => (row.id === id ? { ...row, value } : row)));
    setSegmentErrors((prev) => ({ ...prev, [id]: undefined }));
  };

  const handleRemoveSegment = (id) => {
    setSegmentRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== id)));
    setSegmentErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleAddSegment = () => {
    setSegmentRows((prev) => [...prev, { id: `draft-${uid()}`, value: prev.length ? prev[prev.length - 1].value : "25" }]);
  };

  const submit = () => {
    const parsed = parseTimeFromTitle(title);
    let segments = [];

    if (useSegments) {
      const nextErrors = {};
      const parsedSegments = [];
      segmentRows.forEach((row) => {
        const sec = parseDurationToSeconds(row.value);
        if (!sec || sec < MIN_SEGMENT_SEC || sec > MAX_SEGMENT_SEC) {
          nextErrors[row.id] = "Enter 5s–24h";
        } else {
          parsedSegments.push(clamp(sec, MIN_SEGMENT_SEC, MAX_SEGMENT_SEC));
        }
      });
      if (Object.keys(nextErrors).length) {
        setSegmentErrors(nextErrors);
        return;
      }
      segments = parsedSegments;
    } else if (parsed.segments?.length > 1) {
      segments = parsed.segments.map((sec) => clamp(sec, MIN_SEGMENT_SEC, MAX_SEGMENT_SEC));
    } else if (parsed.durationSec != null) {
      segments = [clamp(parsed.durationSec, MIN_SEGMENT_SEC, MAX_SEGMENT_SEC)];
    } else {
      const manualSec = parseDurationToSeconds(limitInput);
      const fallback = clamp(
        manualSec != null ? manualSec : parseInt(limitInput || "25", 10) * 60,
        MIN_SEGMENT_SEC,
        MAX_SEGMENT_SEC
      );
      segments = [fallback];
    }

    if (!segments.length) {
      segments = [MIN_SEGMENT_SEC];
    }
    setSegmentErrors({});
    const total = segments.reduce((acc, sec) => acc + sec, 0);
    onCreate(colId, { title: parsed.cleanTitle, notes, durationSec: total, segments });
  };

  return (
    <Modal onClose={onClose} title="New Task" palette={palette}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium" style={{ color: palette.subtext }}>Title</label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: 'transparent', border: `1px solid ${palette.border}`, color: palette.text }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium" style={{ color: palette.subtext }}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
            rows={3}
            className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: 'transparent', border: `1px solid ${palette.border}`, color: palette.text }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium" style={{ color: palette.subtext }}>Column</label>
            <select
              value={colId}
              onChange={(e) => setColId(e.target.value)}
              className="mt-1 w-full rounded-xl px-3 py-2 text-sm"
              style={{ backgroundColor: 'transparent', border: `1px solid ${palette.border}`, color: palette.text }}
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium" style={{ color: palette.subtext }}>Timing</label>
            <div className="mt-1 flex items-center gap-3 text-xs" style={{ color: palette.subtext }}>
              <label className="inline-flex items-center gap-1">
                <input type="radio" checked={!useSegments} onChange={() => setUseSegments(false)} /> Single limit
              </label>
              <label className="inline-flex items-center gap-1">
                <input type="radio" checked={useSegments} onChange={() => setUseSegments(true)} /> Segments
              </label>
            </div>
            {!useSegments ? (
              <input
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                className="mt-2 w-full rounded-xl px-3 py-2 text-sm outline-none"
                placeholder="25 or 1:00"
                style={{ backgroundColor: 'transparent', border: `1px solid ${palette.border}`, color: palette.text }}
              />
            ) : (
              <div className="mt-2 space-y-2">
                <SegmentRowsEditor
                  rows={segmentRows}
                  errors={segmentErrors}
                  onChange={handleSegmentChange}
                  onRemove={segmentRows.length > 1 ? handleRemoveSegment : null}
                  palette={palette}
                  showIndex={true}
                />
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-1 text-xs"
                  style={{ border: `1px dashed ${palette.border}`, color: palette.subtext }}
                  onClick={handleAddSegment}
                >
                  Add segment
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-xl px-3 py-2 text-sm" style={{ border: `1px solid ${palette.border}` }}>Cancel</button>
          <button onClick={submit} className="rounded-xl px-3 py-2 text-sm font-medium" style={{ backgroundColor: palette.text, color: palette.bg }}>Create</button>
        </div>
      </div>
    </Modal>
  );
}

function EditCardModal({ card, onClose, onSave, palette }) {
  const [title, setTitle] = useState(card.title);
  const [notes, setNotes] = useState(card.notes || "");
  const [limitInput, setLimitInput] = useState(formatSegmentForInput(card.durationSec || MIN_SEGMENT_SEC));
  const [useSegments, setUseSegments] = useState((card.segments?.length || 0) > 1);
  const [segmentRows, setSegmentRows] = useState(() => segmentDraftsFromSegments(card.segments));
  const [segmentErrors, setSegmentErrors] = useState({});
  const [limitError, setLimitError] = useState("");

  useEffect(() => {
    if (!useSegments) setSegmentErrors({});
  }, [useSegments]);

  const handleSegmentChange = (id, value) => {
    setSegmentRows((prev) => prev.map((row) => (row.id === id ? { ...row, value } : row)));
    setSegmentErrors((prev) => ({ ...prev, [id]: undefined }));
  };

  const handleRemoveSegment = (id) => {
    setSegmentRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== id)));
    setSegmentErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleAddSegment = () => {
    setSegmentRows((prev) => [...prev, { id: `draft-${uid()}`, value: prev.length ? prev[prev.length - 1].value : formatSegmentForInput(MIN_SEGMENT_SEC) }]);
  };

  const submit = () => {
    let durations = [];

    if (useSegments) {
      const nextErrors = {};
      segmentRows.forEach((row) => {
        const sec = parseDurationToSeconds(row.value);
        if (!sec || sec < MIN_SEGMENT_SEC || sec > MAX_SEGMENT_SEC) {
          nextErrors[row.id] = "Enter 5s–24h";
        } else {
          durations.push(clamp(sec, MIN_SEGMENT_SEC, MAX_SEGMENT_SEC));
        }
      });
      if (Object.keys(nextErrors).length) {
        setSegmentErrors(nextErrors);
        return;
      }
    } else {
      const sec = parseDurationToSeconds(limitInput);
      if (!sec || sec < MIN_SEGMENT_SEC || sec > MAX_SEGMENT_SEC) {
        setLimitError("Enter 5s–24h");
        return;
      }
      setLimitError("");
      durations = [clamp(sec, MIN_SEGMENT_SEC, MAX_SEGMENT_SEC)];
    }

    if (!durations.length) durations = [MIN_SEGMENT_SEC];

    const segmentsPayload = durations.map((sec, idx) => {
      const existing = card.segments?.[idx];
      const remaining = existing ? clamp(Math.floor(existing.remainingSec ?? sec), 0, sec) : sec;
      return {
        id: existing?.id || `${card.id}-seg-${idx}-${uid()}`,
        durationSec: sec,
        remainingSec: remaining,
      };
    });

    const nextActiveIndex = findNextActiveSegment(segmentsPayload);

    onSave({
      title,
      notes,
      segments: segmentsPayload,
      running: false,
      lastStartTs: null,
      remainingSecAtStart: segmentsPayload[nextActiveIndex]?.remainingSec ?? 0,
      activeSegmentIndex: nextActiveIndex,
      overtime: false,
    });
  };

  return (
    <Modal onClose={onClose} title="Edit Task" palette={palette}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium" style={{ color: palette.subtext }}>Title</label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: 'transparent', border: `1px solid ${palette.border}`, color: palette.text }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium" style={{ color: palette.subtext }}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
            rows={3}
            className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: 'transparent', border: `1px solid ${palette.border}`, color: palette.text }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium" style={{ color: palette.subtext }}>Timing</label>
          <div className="mt-1 flex items-center gap-3 text-xs" style={{ color: palette.subtext }}>
            <label className="inline-flex items-center gap-1">
              <input type="radio" checked={!useSegments} onChange={() => setUseSegments(false)} /> Single limit
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="radio" checked={useSegments} onChange={() => setUseSegments(true)} /> Segments
            </label>
          </div>
          {!useSegments ? (
            <>
              <input
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                className="mt-2 w-full rounded-xl px-3 py-2 text-sm outline-none"
                placeholder="25 or 1:00"
                style={{ backgroundColor: 'transparent', border: `1px solid ${palette.border}`, color: palette.text }}
              />
              {limitError ? <p className="mt-1 text-[11px]" style={{ color: palette.dangerText }}>{limitError}</p> : null}
            </>
          ) : (
            <div className="mt-2 space-y-2">
              <SegmentRowsEditor
                rows={segmentRows}
                errors={segmentErrors}
                onChange={handleSegmentChange}
                onRemove={segmentRows.length > 1 ? handleRemoveSegment : null}
                palette={palette}
                showIndex={true}
              />
              <button
                type="button"
                className="w-full rounded-md px-2 py-1 text-xs"
                style={{ border: `1px dashed ${palette.border}`, color: palette.subtext }}
                onClick={handleAddSegment}
              >
                Add segment
              </button>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-xl px-3 py-2 text-sm" style={{ border: `1px solid ${palette.border}` }}>Cancel</button>
          <button onClick={submit} className="rounded-xl px-3 py-2 text-sm font-medium" style={{ backgroundColor: palette.text, color: palette.bg }}>Save</button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children, palette }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center p-4">
      <div className="absolute inset-0" onClick={onClose} style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl p-4 shadow-xl border" style={{ backgroundColor: palette.surface, borderColor: palette.border }}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold" style={{ color: palette.text }}>{title}</h3>
          <button onClick={onClose} className="rounded-md p-1" style={{ color: palette.subtext }}><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SettingsModal({ onClose, theme, setTheme, sound, setSound, onTest, palette, chimeActive, onStopChime }) {
  return (
    <Modal onClose={onClose} title="Settings" palette={palette}>
      <div className="space-y-6">
        <section>
          <h4 className="text-sm font-semibold" style={{ color: palette.text }}>Appearance</h4>
          <div className="mt-2 flex items-center gap-3">
            <button onClick={() => setTheme('dark')} className={`rounded-lg px-3 py-2 text-sm ${theme==='dark' ? 'font-semibold' : ''}`} style={{ border: `1px solid ${palette.border}` }}>
              <span className="inline-flex items-center gap-2"><Moon className="h-4 w-4" /> Dark</span>
            </button>
            <button onClick={() => setTheme('light')} className={`rounded-lg px-3 py-2 text-sm ${theme==='light' ? 'font-semibold' : ''}`} style={{ border: `1px solid ${palette.border}` }}>
              <span className="inline-flex items-center gap-2"><Sun className="h-4 w-4" /> Light</span>
            </button>
          </div>
        </section>

        <section>
          <h4 className="text-sm font-semibold" style={{ color: palette.text }}>Sound</h4>
          <div className="mt-2 space-y-3">
            <label className="inline-flex items-center gap-2 text-sm" style={{ color: palette.text }}>
              <input type="checkbox" checked={!!sound.enabled} onChange={(e) => setSound({ ...sound, enabled: e.target.checked })} />
              {sound.enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} Enable chime on completion
            </label>

            <div className="flex items-center gap-3">
              <label className="text-sm" style={{ color: palette.subtext, minWidth: 64 }}>Chime</label>
              <select
                value={sound.type}
                onChange={(e) => setSound({ ...sound, type: e.target.value })}
                className="rounded-md px-2 py-1 text-sm"
                style={{ backgroundColor: 'transparent', border: `1px solid ${palette.border}`, color: palette.text }}
              >
                <option value="ping">Ping</option>
                <option value="bell">Bell</option>
                <option value="alarm">Alarm</option>
                <option value="wood">Woodblock</option>
              </select>
              <button onClick={onTest} className="rounded-md px-2 py-1 text-sm" style={{ border: `1px solid ${palette.border}` }}>Test</button>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm" style={{ color: palette.subtext, minWidth: 64 }}>Volume</label>
              <input type="range" min={0} max={1} step={0.01} value={sound.volume} onChange={(e) => setSound({ ...sound, volume: Number(e.target.value) })} className="w-40" />
              <span className="tabular-nums text-sm" style={{ color: palette.subtext }}>{Math.round(sound.volume * 100)}%</span>
            </div>

            <label className="inline-flex items-center gap-2 text-sm" style={{ color: palette.text }}>
              <input type="checkbox" checked={!!sound.loop} onChange={(e) => setSound({ ...sound, loop: e.target.checked })} />
              Play until stopped
            </label>

            {chimeActive && (
              <div className="flex items-center gap-2">
                <button onClick={onStopChime} className="rounded-md px-2 py-1 text-sm" style={{ border: `1px solid ${palette.border}` }}>
                  <VolumeX className="inline h-4 w-4 mr-1" /> Stop chime
                </button>
                <span className="text-xs" style={{ color: palette.subtext }}>Chime is playing…</span>
              </div>
            )}
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-3 py-2 text-sm" style={{ border: `1px solid ${palette.border}` }}>Close</button>
        </div>
      </div>
    </Modal>
  );
}
