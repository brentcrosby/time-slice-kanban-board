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

// Parse time expressions embedded in a title string.
function parseTimeFromTitle(rawTitle) {
  let title = rawTitle || "";
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
  return { cleanTitle: title || rawTitle, durationSec };
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
  const [cardsByCol, setCardsByCol] = useState(() => loadState()?.cardsByCol || { todo: [], doing: [], done: [] });

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
    if (!card.running || !card.lastStartTs) return card;
    const now = Date.now();
    const elapsed = Math.floor((now - card.lastStartTs) / 1000);
    const newRemaining = card.remainingSecAtStart - elapsed;
    const remainingSec = Math.max(newRemaining, -359999);
    const overtime = remainingSec <= 0;
    return { ...card, remainingSec, overtime };
  };

  const materialized = useMemo(() => {
    const out = {};
    for (const col of columns) out[col.id] = (cardsByCol[col.id] || []).map(recompute);
    return out;
  }, [cardsByCol, columns, tick]);

  // Complete cards auto-move to top of Done + chime
  useEffect(() => {
    const toComplete = [];
    for (const col of columns) {
      if (col.id === "done") continue;
      for (const c of (materialized[col.id] || [])) {
        if (c.remainingSec <= 0) toComplete.push({ from: col.id, cardId: c.id });
      }
    }
    if (!toComplete.length) return;

    if (sound.enabled) {
      if (sound.loop) startLoopingChime(); else playChime(audioRef, { type: sound.type, volume: sound.volume });
    }

    setCardsByCol(prev => {
      let next = { ...prev };
      toComplete.forEach(({ from, cardId }) => {
        const src = [...(next[from] || [])];
        const idx = src.findIndex(x => x.id === cardId);
        if (idx === -1) return;
        const [card] = src.splice(idx, 1);
        const done = [...(next["done"] || [])];
        const updated = { ...card, running: false, overtime: true, lastStartTs: null, remainingSec: 0, remainingSecAtStart: 0 };
        done.unshift(updated);
        next = { ...next, [from]: src, ["done"]: done };
      });
      return next;
    });
  }, [materialized, columns, sound]);

  // Persist board state
  useEffect(() => { saveState({ cardsByCol }); }, [cardsByCol]);

  // =====================
  // Actions
  // =====================
  const addCard = (colId, payload) => {
    const id = uid();
    const durationSec = Math.max(5, payload.durationSec || 1500);
    const card = {
      id,
      title: payload.title?.trim() || "Untitled",
      notes: payload.notes?.trim() || "",
      durationSec,
      remainingSec: durationSec,
      remainingSecAtStart: durationSec,
      running: false,
      lastStartTs: null,
      overtime: false,
      createdAt: Date.now(),
    };
    setCardsByCol(prev => ({ ...prev, [colId]: [...(prev[colId] || []), card] }));
  };

  const updateCard = (colId, cardId, patch) => {
    setCardsByCol(prev => ({
      ...prev,
      [colId]: (prev[colId] || []).map(c => (c.id === cardId ? { ...c, ...patch } : c)),
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
    if (card.running) return;
    updateCard(colId, card.id, { running: true, lastStartTs: Date.now(), remainingSecAtStart: card.remainingSec });
  };

  const pauseTimer = (colId, card) => {
    if (!card.running) return;
    const now = Date.now();
    const elapsed = Math.floor((now - card.lastStartTs) / 1000);
    const remaining = card.remainingSecAtStart - elapsed;
    updateCard(colId, card.id, { running: false, remainingSec: remaining, remainingSecAtStart: remaining, lastStartTs: null });
  };

  const resetTimer = (colId, card) => {
    updateCard(colId, card.id, { running: false, remainingSec: card.durationSec, remainingSecAtStart: card.durationSec, lastStartTs: null, overtime: false });
  };

  const setNewDuration = (colId, card, durationSec) => {
    const d = clamp(Math.floor(durationSec), 5, 24 * 3600);
    updateCard(colId, card.id, { durationSec: d, remainingSec: d, remainingSecAtStart: d, running: false, lastStartTs: null, overtime: false });
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
      const updated = { ...item, running: true, lastStartTs: now, remainingSecAtStart: item.remainingSec };
      doing.unshift(updated);
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
                  onSetDuration={(s) => setNewDuration(col.id, card, s)}
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

function LimitEditor({ card, onSetDuration, palette }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(Math.round(card.durationSec / 60)));
  const inputRef = useRef(null);
  useEffect(() => { if (editing) setTimeout(() => inputRef.current?.focus(), 0); }, [editing]);

  if (!editing) {
    return (
      <button type="button" className="underline decoration-dotted underline-offset-2" style={{ color: palette.subtext }} onClick={() => setEditing(true)} title="Click to change limit">
        Limit: {secsToHMS(card.durationSec)}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <input
        ref={inputRef}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const sec = parseDurationToSeconds(val);
            if (sec && sec >= 5) { onSetDuration(sec); setEditing(false); }
          } else if (e.key === "Escape") {
            setEditing(false); setVal(String(Math.round(card.durationSec / 60)));
          }
        }}
        placeholder="e.g. 25m or 1:30"
        className="w-28 rounded-md px-2 py-1 text-[11px] outline-none"
        style={{ backgroundColor: "transparent", border: `1px solid ${palette.border}`, color: palette.text }}
      />
      <button className="rounded-md px-2 py-1 text-[11px]" style={{ border: `1px solid ${palette.border}` }} onClick={() => { const sec = parseDurationToSeconds(val); if (sec && sec >= 5) { onSetDuration(sec); setEditing(false); } }}>Save</button>
      <button className="rounded-md px-2 py-1 text-[11px]" style={{ border: `1px solid ${palette.border}` }} onClick={() => { setEditing(false); setVal(String(Math.round(card.durationSec / 60))); }}>Cancel</button>
    </span>
  );
}

function Card({ card, colId, onStart, onPause, onReset, onRemove, onEdit, onSetDuration, index, palette }) {
  const ref = useRef(null);
  const percent = (() => {
    if (card.running && card.lastStartTs) {
      const elapsed = (Date.now() - card.lastStartTs) / 1000; // fractional seconds for smooth bar
      const remaining = card.remainingSecAtStart - elapsed;
      return clamp(100 * (1 - remaining / card.durationSec), 0, 100);
    }
    return clamp(100 * (1 - card.remainingSec / card.durationSec), 0, 100);
  })();
  const isOver = card.remainingSec <= 0;

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
        <div className="relative h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: palette.barBg }}>
          <div className="absolute left-0 top-0 h-full transition-all duration-200" style={{ width: `${percent}%`, backgroundColor: isOver ? '#fda4af' : palette.barFill }} />
        </div>
        <div className="mt-1 flex items-center justify-between text-xs" style={{ color: palette.subtext }}>
          <LimitEditor card={card} onSetDuration={(sec) => onSetDuration(sec)} palette={palette} />
          <span className={`${isOver ? "font-semibold" : ""}`} style={{ color: isOver ? '#b91c1c' : palette.subtext }}>
            {isOver ? `Over: ${secsToHMS(-card.remainingSec)}` : `Left: ${secsToHMS(card.remainingSec)}`}
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
  const [mins, setMins] = useState("25");

  const submit = () => {
    const parsed = parseTimeFromTitle(title);
    const fallback = clamp(parseInt(mins || "25", 10) * 60, 5, 24 * 3600);
    const effective = parsed.durationSec != null ? clamp(parsed.durationSec, 5, 24 * 3600) : fallback;
    onCreate(colId, { title: parsed.cleanTitle, notes, durationSec: effective });
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
            <label className="block text-xs font-medium" style={{ color: palette.subtext }}>Time limit (minutes)</label>
            <input
              value={mins}
              onChange={(e) => setMins(e.target.value.replace(/[^0-9]/g, ""))}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
              className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none"
              inputMode="numeric"
              style={{ backgroundColor: 'transparent', border: `1px solid ${palette.border}`, color: palette.text }}
            />
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
  const [mins, setMins] = useState(String(Math.round(card.durationSec / 60)));

  const submit = () => {
    const durationSec = clamp(parseInt(mins || "25", 10) * 60, 5, 24 * 3600);
    const running = false;
    onSave({ title, notes, durationSec, remainingSec: durationSec, remainingSecAtStart: durationSec, running, lastStartTs: null, overtime: false });
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
          <label className="block text-xs font-medium" style={{ color: palette.subtext }}>Time limit (minutes)</label>
          <input
            value={mins}
            onChange={(e) => setMins(e.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none"
            inputMode="numeric"
            style={{ backgroundColor: 'transparent', border: `1px solid ${palette.border}`, color: palette.text }}
          />
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
