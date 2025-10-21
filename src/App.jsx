import React, { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "./components/Header";
import { Column } from "./components/Column";
import { Card } from "./components/Card";
import { Modal } from "./components/Modal";
import { NewCardModal } from "./components/NewCardModal";
import { EditCardModal } from "./components/EditCardModal";
import { SettingsModal } from "./components/SettingsModal";
import { DEFAULT_COLUMNS, MIN_SEGMENT_SEC } from "./constants";
import { useNowTicker } from "./hooks/useNowTicker";
import { clamp, uid } from "./utils/misc";
import {
  coerceSegmentDurations,
  deriveCardFromSegments,
  findNextActiveSegment,
  upgradeLegacyCard,
} from "./utils/segments";
import { createAudioCtx, playChime } from "./utils/audio";
import { loadSound, loadState, loadTheme, saveSound, saveState, saveTheme } from "./utils/storage";

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

  const [theme, setTheme] = useState(loadTheme());
  const [sound, setSound] = useState(loadSound());
  useEffect(() => saveTheme(theme), [theme]);
  useEffect(() => saveSound(sound), [sound]);

  const isDark = theme === "dark";
  const palette = useMemo(
    () => ({
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
    }),
    [isDark]
  );

  const audioRef = useRef(null);
  const [chimeActive, setChimeActive] = useState(false);
  const loopRef = useRef({ id: null });

  const startLoopingChime = () => {
    if (loopRef.current.id) return;
    setChimeActive(true);
    playChime(audioRef, { type: sound.type, volume: sound.volume });
    loopRef.current.id = setInterval(
      () => playChime(audioRef, { type: sound.type, volume: sound.volume }),
      1200
    );
  };

  const stopLoopingChime = () => {
    if (loopRef.current.id) {
      clearInterval(loopRef.current.id);
      loopRef.current.id = null;
    }
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

  useEffect(() => {
    if (!sound.enabled) stopLoopingChime();
  }, [sound.enabled]);

  const runningCount = useMemo(
    () => Object.values(cardsByCol).flat().filter((card) => card.running).length,
    [cardsByCol]
  );
  const tick = useNowTicker(runningCount);

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
    const activeSegment =
      normalized.segments[activeIdx] ||
      normalized.segments[normalized.segments.length - 1] || {
        remainingSec: 0,
        durationSec: 1,
      };

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

  useEffect(() => {
    const now = Date.now();
    let chimeNeeded = false;

    setCardsByCol((prev) => {
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
              segments.length
                ? segments
                : [
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

        next[col.id] = colChanged ? newList : prevList;
      }

      if (!mutated) return prev;

      const doneList = [...(next.done || prev.done || [])];
      doneIncoming.forEach(({ card }) => doneList.unshift(card));
      next.done = doneList;
      return next;
    });

    if (chimeNeeded && sound.enabled) {
      if (sound.loop) startLoopingChime();
      else playChime(audioRef, { type: sound.type, volume: sound.volume });
    }
  }, [tick, columns, sound]);

  useEffect(() => {
    saveState({ cardsByCol });
  }, [cardsByCol]);

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
    setCardsByCol((prev) => ({ ...prev, [colId]: [...(prev[colId] || []), card] }));
  };

  const updateCard = (colId, cardId, patch) => {
    const updater = typeof patch === "function" ? patch : (card) => ({ ...card, ...patch });
    setCardsByCol((prev) => ({
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
    setCardsByCol((prev) => ({
      ...prev,
      [colId]: (prev[colId] || []).filter((c) => c.id !== cardId),
    }));
  };

  const moveCard = (fromCol, toCol, cardId, index = null) => {
    if (fromCol === toCol) return;
    setCardsByCol((prev) => {
      const src = [...(prev[fromCol] || [])];
      const idx = src.findIndex((c) => c.id === cardId);
      if (idx === -1) return prev;
      const [card] = src.splice(idx, 1);
      const dest = [...(prev[toCol] || [])];
      if (index === null || index < 0 || index > dest.length) dest.push(card);
      else dest.splice(index, 0, card);
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
          remainingSec: segments.reduce(
            (sum, seg) => sum + (seg.remainingSec ?? seg.durationSec ?? 0),
            0
          ),
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
        const safeRemaining =
          nextRemaining == null ? seg.remainingSec : clamp(Math.floor(nextRemaining), 0, seg.durationSec);
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

  const doClearAll = () => {
    setCardsByCol({ todo: [], doing: [], done: [] });
    setConfirmClearOpen(false);
  };

  const handleStart = (colId, card) => {
    if (colId !== "todo") {
      startTimer(colId, card);
      return;
    }
    setCardsByCol((prev) => {
      const src = [...(prev.todo || [])];
      const idx = src.findIndex((c) => c.id === card.id);
      if (idx === -1) return prev;
      const [item] = src.splice(idx, 1);
      const doing = [...(prev.doing || [])];
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
      const runningCard =
        activeSegment && activeSegment.remainingSec > 0
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
              onAddCard={() => {
                setNewCardCol(col.id);
                setShowNewCard(true);
              }}
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
          onCreate={(colId, payload) => {
            addCard(colId, payload);
            setShowNewCard(false);
          }}
          columns={columns}
          palette={palette}
        />
      )}

      {editCard && (
        <EditCardModal
          card={editCard.card}
          onClose={() => setEditCard(null)}
          onSave={(patch) => {
            updateCard(editCard.colId, editCard.card.id, patch);
            setEditCard(null);
          }}
          palette={palette}
        />
      )}

      {confirmClearOpen && (
        <Modal title="Clear all tasks?" onClose={() => setConfirmClearOpen(false)} palette={palette}>
          <div className="space-y-3">
            <p className="text-sm" style={{ color: palette.subtext }}>
              This will remove every card in <em>To Do</em>, <em>In Progress</em>, and <em>Done</em>. This action cannot
              be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmClearOpen(false)}
                className="rounded-xl px-3 py-2 text-sm"
                style={{ border: `1px solid ${palette.border}` }}
              >
                Cancel
              </button>
              <button
                onClick={doClearAll}
                className="rounded-xl px-3 py-2 text-sm font-medium"
                style={{ backgroundColor: palette.dangerBg, color: palette.dangerText }}
              >
                Clear all
              </button>
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
