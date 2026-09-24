import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Header } from "./components/Header";
import { Column } from "./components/Column";
import { Card } from "./components/Card";
import { HelpModal } from "./components/HelpModal";
import { Modal } from "./components/Modal";
import { EditCardModal } from "./components/EditCardModal";
import { SettingsModal } from "./components/SettingsModal";
import { DEFAULT_COLUMNS, MIN_SEGMENT_SEC } from "./constants";
import { BODY_FALLBACK_BG, THEME_COLORS } from "./constants/themeColors";
import { useNowTicker } from "./hooks/useNowTicker";
import { clamp, uid } from "./utils/misc";
import {
  coerceSegmentDurations,
  deriveCardFromSegments,
  findNextActiveSegment,
  sanitizeSegmentDuration,
  upgradeLegacyCard,
} from "./utils/segments";
import { ensureAudioContext, playChime } from "./utils/audio";
import { loadSound, loadState, loadTheme, saveSound, saveState, saveTheme } from "./utils/storage";
import { parseTimeFromTitle } from "./utils/time";
import { useTaskSync } from "./hooks/useTaskSync";

const HISTORY_LIMIT = 100;
const BREAK_DURATION_SEC = 600;

const cloneCardsState = (state) => JSON.parse(JSON.stringify(state));

export default function KanbanTimerBoard() {
  const initialStoredStateRef = useRef(loadState());
  const initialStoredState = initialStoredStateRef.current;

  const [columns] = useState(DEFAULT_COLUMNS);
  const [cardsByCol, setCardsByCol] = useState(() => {
    const stored = initialStoredState?.cardsByCol || {};
    const initial = {};
    DEFAULT_COLUMNS.forEach((col) => {
      initial[col.id] = (stored[col.id] || []).map(upgradeLegacyCard);
    });
    return initial;
  });
  const historyRef = useRef([]);
  const futureRef = useRef([]);

  const [filter, setFilter] = useState("");
  const [pendingTitleEditId, setPendingTitleEditId] = useState(null);
  const [editCard, setEditCard] = useState(null); // { colId, card }
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmColumnClear, setConfirmColumnClear] = useState(null); // { colId, name }
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const [theme, setTheme] = useState(loadTheme());
  const [sound, setSound] = useState(loadSound());
  const [autoMoveEnabled, setAutoMoveEnabled] = useState(() => initialStoredState?.autoMoveEnabled ?? true);
  const [syncSetupOpen, setSyncSetupOpen] = useState(false);
  useEffect(() => saveTheme(theme), [theme]);
  useEffect(() => saveSound(sound), [sound]);

  const localSyncState = useMemo(() => ({ cardsByCol, autoMoveEnabled }), [cardsByCol, autoMoveEnabled]);
  const applySyncedState = useCallback((state) => {
    if (!state || typeof state !== "object") return;
    setCardsByCol((current) => {
      const next = {};
      DEFAULT_COLUMNS.forEach((column) => {
        const cards = state.cardsByCol?.[column.id];
        next[column.id] = Array.isArray(cards) ? cards.map(upgradeLegacyCard) : current[column.id] || [];
      });
      return next;
    });
    if (typeof state.autoMoveEnabled === "boolean") setAutoMoveEnabled(state.autoMoveEnabled);
    historyRef.current = [];
    futureRef.current = [];
  }, []);
  const taskSync = useTaskSync(localSyncState, applySyncedState);

  const updateCardsState = useCallback(
    (updater, { track = false } = {}) => {
      setCardsByCol((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        if (next === prev) return prev;
        if (track) {
          historyRef.current.push(cloneCardsState(prev));
          if (historyRef.current.length > HISTORY_LIMIT) {
            historyRef.current.shift();
          }
          futureRef.current = [];
        }
        return next;
      });
    },
    [setCardsByCol]
  );

  const undo = useCallback(() => {
    setCardsByCol((prev) => {
      if (!historyRef.current.length) return prev;
      const snapshot = historyRef.current.pop();
      futureRef.current.push(cloneCardsState(prev));
      if (futureRef.current.length > HISTORY_LIMIT) {
        futureRef.current.shift();
      }
      return snapshot;
    });
  }, [setCardsByCol]);

  const redo = useCallback(() => {
    setCardsByCol((prev) => {
      if (!futureRef.current.length) return prev;
      const snapshot = futureRef.current.pop();
      historyRef.current.push(cloneCardsState(prev));
      if (historyRef.current.length > HISTORY_LIMIT) {
        historyRef.current.shift();
      }
      return snapshot;
    });
  }, [setCardsByCol]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.defaultPrevented) return;
      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();
      const isEditable =
        target?.isContentEditable ||
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select";
      if (isEditable) return;

      const key = event.key?.toLowerCase();
      const isUndoCombo = key === "z" && !event.shiftKey && (event.metaKey || event.ctrlKey);
      const isRedoCombo =
        (event.ctrlKey && key === "y") ||
        (event.metaKey && event.shiftKey && key === "z") ||
        (event.ctrlKey && event.shiftKey && key === "z");

      if (isUndoCombo) {
        if (!historyRef.current.length) return;
        event.preventDefault();
        undo();
        return;
      }

      if (isRedoCombo) {
        if (!futureRef.current.length) return;
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  const toggleTheme = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  const isDark = theme === "dark";
  const palette = useMemo(
    () => ({ ...THEME_COLORS[isDark ? "dark" : "light"] }),
    [isDark]
  );

  useEffect(() => {
    document.body.style.backgroundColor = palette.bg;
    return () => {
      document.body.style.backgroundColor = BODY_FALLBACK_BG;
    };
  }, [palette.bg]);

  const audioRef = useRef(null);
  const [chimeActive, setChimeActive] = useState(false);
  const [loopingChimeSources, setLoopingChimeSources] = useState([]);
  const loopRef = useRef({ id: null });
  const chimeTimeoutRef = useRef(null);

  const stopLoopingChime = () => {
    console.log("[Audio] stopLoopingChime", { loopId: loopRef.current.id });
    if (loopRef.current.id) {
      clearInterval(loopRef.current.id);
      loopRef.current.id = null;
    }
    if (chimeTimeoutRef.current) {
      clearTimeout(chimeTimeoutRef.current);
      chimeTimeoutRef.current = null;
    }
    setChimeActive(false);
    setLoopingChimeSources([]);
  };

  const startLoopingChime = (sourceIds = []) => {
    if (sourceIds.length) {
      setLoopingChimeSources((prev) => {
        const merged = new Set(prev);
        sourceIds.filter(Boolean).forEach((id) => merged.add(id));
        return Array.from(merged);
      });
    }
    if (chimeTimeoutRef.current) {
      clearTimeout(chimeTimeoutRef.current);
    }
    chimeTimeoutRef.current = setTimeout(() => {
      console.log("[Audio] auto-stopping chime after max duration");
      stopLoopingChime();
    }, 30000);
    console.log("[Audio] startLoopingChime", {
      existingLoopId: loopRef.current.id,
      sound,
    });
    if (loopRef.current.id) return;
    const ctx = ensureAudioContext(audioRef);
    console.log("[Audio] startLoopingChime ensureAudioContext", {
      hasCtx: Boolean(ctx),
      ctxState: ctx?.state,
    });
    if (!ctx) return;
    setChimeActive(true);
    playChime(audioRef, { type: sound.type, volume: sound.volume });
    loopRef.current.id = setInterval(
      () => playChime(audioRef, { type: sound.type, volume: sound.volume }),
      1200
    );
  };

  const removeChimeSources = useCallback(
    (sourceIds = []) => {
      if (!sourceIds.length) return;
      let shouldStop = false;
      setLoopingChimeSources((prev) => {
        const next = prev.filter((id) => !sourceIds.includes(id));
        if (prev.length && !next.length) {
          shouldStop = true;
        }
        return next;
      });

      if (shouldStop) {
        stopLoopingChime();
      }
    },
    [stopLoopingChime]
  );

  useEffect(() => {
    const arm = () => {
      console.log("[Audio] pointerdown arm triggered");
      const ctx = ensureAudioContext(audioRef);
      console.log("[Audio] pointerdown ensureAudioContext", {
        hasCtx: Boolean(ctx),
        ctxState: ctx?.state,
      });
      const maybePromise = ctx?.resume?.();
      if (maybePromise && typeof maybePromise.catch === "function") {
        maybePromise.catch(() => {});
      }
      window.removeEventListener("pointerdown", arm);
    };
    window.addEventListener("pointerdown", arm, { once: true });
    return () => window.removeEventListener("pointerdown", arm);
  }, []);

  useEffect(() => {
    if (!sound.enabled) stopLoopingChime();
  }, [sound.enabled]);

  const runningCount = useMemo(
    () => Object.values(cardsByCol).flat().filter((card) => card.running || card.stopwatch?.running).length,
    [cardsByCol]
  );
  const tick = useNowTicker(runningCount);

  useEffect(() => {
    console.log("[Timer] runningCount updated", { runningCount });
  }, [runningCount]);

  const recompute = (card) => {
    if (!card.segments?.length) {
      const stopwatch = card.stopwatch;
      const elapsedSec = stopwatch?.running && stopwatch.lastStartTs
        ? (stopwatch.elapsedSec || 0) + (Date.now() - stopwatch.lastStartTs) / 1000
        : stopwatch?.elapsedSec || 0;
      return stopwatch
        ? { ...card, computedStopwatchElapsed: Math.max(0, elapsedSec) }
        : card;
    }
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

    const baseRemaining = normalized.remainingSecAtStart ?? activeSegment.remainingSec;

    if (!normalized.running || !normalized.lastStartTs) {
      return {
        ...normalized,
        computedActiveRemaining: baseRemaining,
        segments: normalized.segments.map((seg, idx) =>
          idx === activeIdx ? { ...seg, remainingSec: baseRemaining } : seg
        ),
      };
    }

    const now = Date.now();
    const elapsed = (now - normalized.lastStartTs) / 1000;
    const computedRemaining = Math.max(baseRemaining - elapsed, 0);
    const updatedSegments = normalized.segments.map((seg, idx) => {
      if (idx !== activeIdx) return seg;
      const clamped = clamp(computedRemaining, 0, seg.durationSec);
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
    console.log("[Timer] completion sweep", { tick });
    const completions = [];

    for (const col of columns) {
      if (col.id === "done") continue;
      const cards = materialized[col.id] || [];
      for (const card of cards) {
        if (!card.running) continue;
        const rawSegments = (card.segments || []).map((seg) => ({
          ...seg,
          remainingSec: clamp(seg.remainingSec ?? 0, 0, seg.durationSec ?? seg.remainingSec ?? 0),
        }));
        const activeIndex =
          typeof card.activeSegmentIndex === "number" ? card.activeSegmentIndex : findNextActiveSegment(rawSegments);
        const activeSegment = rawSegments[activeIndex] || rawSegments[rawSegments.length - 1];
        const activeRemaining =
          card.computedActiveRemaining ??
          activeSegment?.remainingSec ??
          (card.remainingSecAtStart ?? activeSegment?.durationSec ?? 0);
        const normalizedSegments = rawSegments.map((seg, idx) =>
          idx === activeIndex ? { ...seg, remainingSec: 0 } : seg
        );
        const totalRemaining = normalizedSegments.reduce((sum, seg) => sum + (seg.remainingSec ?? 0), 0);

        console.log("[Timer] sweep evaluate", {
          colId: col.id,
          cardId: card.id,
          totalRemaining,
          activeRemaining,
          activeIndex,
          running: card.running,
          segments: normalizedSegments.map((seg, idx) => ({
            idx,
            remainingSec: seg.remainingSec,
            durationSec: seg.durationSec,
          })),
        });

        if (activeRemaining > 0.05) continue;

        const nextActiveIndex = findNextActiveSegment(normalizedSegments);

        const payload = {
          colId: col.id,
          cardId: card.id,
          totalRemaining,
          activeRemaining,
          segments: normalizedSegments,
          activeIndex,
          nextActiveIndex,
          cardSnapshot: card,
        };

        completions.push(payload);
      }
    }

    if (!completions.length) {
      console.log("[Timer] completion sweep done", { completions: 0 });
      return;
    }

    console.log("[Timer] completion sweep hits", completions);

    if (sound.enabled) {
      if (sound.loop) startLoopingChime(completions.map(({ cardId }) => cardId));
      else {
        setLoopingChimeSources([]);
        playChime(audioRef, { type: sound.type, volume: sound.volume });
      }
    } else {
      console.log("[Audio] chime skipped; sound disabled");
    }

    setCardsByCol((prev) => {
      let mutated = false;
      const next = { ...prev };
      const doneQueue = [];

      completions.forEach(({ colId, cardId, totalRemaining, segments, nextActiveIndex, activeIndex }) => {
        const list = [...(next[colId] || [])];
        const idx = list.findIndex((c) => c.id === cardId);
        if (idx === -1) return;
        const source = list[idx];
        mutated = true;

          const finalizedSegments = segments.length
            ? segments.map((seg) => ({ ...seg }))
            : [
                {
                  id: `${source.id || "card"}-seg-0`,
                  durationSec: source.durationSec ?? source.remainingSec ?? MIN_SEGMENT_SEC,
                  remainingSec: 0,
                },
              ];

        if (totalRemaining <= 0.05) {
          if (source.isBreak) {
            list.splice(idx, 1);
            next[colId] = list;
            mutated = true;
            return;
          }
          const completed = deriveCardFromSegments(
            { ...source, running: false, lastStartTs: null },
            finalizedSegments.map((seg) => ({ ...seg, remainingSec: 0 })),
            {
              remainingSecAtStart: 0,
              activeSegmentIndex: Math.max(finalizedSegments.length - 1, 0),
              overtime: true,
            }
          );
          if (autoMoveEnabled) {
            list.splice(idx, 1);
            doneQueue.push(completed);
          } else {
            list[idx] = completed;
          }
        } else {
          const paused = deriveCardFromSegments(
            { ...source, running: false, lastStartTs: null },
            finalizedSegments,
            {
              remainingSecAtStart: finalizedSegments[nextActiveIndex]?.remainingSec ?? 0,
              activeSegmentIndex: nextActiveIndex,
              overtime: false,
            }
          );
          list[idx] = paused;
        }

        next[colId] = list;
      });

      if (doneQueue.length) {
        const doneList = [...(next.done || [])];
        doneQueue.forEach((card) => doneList.unshift(card));
        next.done = doneList;
      }

      return mutated ? next : prev;
    });
  }, [materialized, columns, sound, autoMoveEnabled]);

  useEffect(() => {
    saveState({ cardsByCol, autoMoveEnabled });
  }, [cardsByCol, autoMoveEnabled]);

  const addCard = (colId, payload = {}) => {
    const id = uid();
    const hasTimer = (payload.segments?.length || 0) > 0 || (payload.durationSec || 0) > 0;
    const durations = hasTimer ? coerceSegmentDurations(payload.segments, payload.durationSec) : [];
    const segments = durations.map((sec, idx) => ({
      id: `${id}-seg-${idx}`,
      durationSec: sec,
      remainingSec: sec,
    }));
    const rawTitle = typeof payload.title === "string" ? payload.title.trim() : "";
    const rawNotes = typeof payload.notes === "string" ? payload.notes.trim() : "";
    const rawGroup = payload.group;
    const normalizedGroup = rawGroup === "" ? null : rawGroup ?? null;
    const isDraft = Boolean(payload.isDraft);
    const baseCard = {
      id,
      title: isDraft ? rawTitle : rawTitle || "Untitled",
      notes: rawNotes,
      subtasks: [],
      group: normalizedGroup,
      running: false,
      lastStartTs: null,
      overtime: false,
      createdAt: Date.now(),
      isDraft,
    };
    const card = deriveCardFromSegments(baseCard, segments, {
      running: false,
      remainingSecAtStart: segments[0]?.remainingSec ?? 0,
      activeSegmentIndex: 0,
      overtime: false,
    });
    updateCardsState(
      (prev) => ({ ...prev, [colId]: [...(prev[colId] || []), card] }),
      { track: true }
    );
    return card.id;
  };

  const startDraftCard = (colId) => {
    const newId = addCard(colId, { title: "", isDraft: true });
    setPendingTitleEditId(newId);
    return newId;
  };

  const startBreak = () => {
    const id = uid();
    const now = Date.now();
    const durationSec = BREAK_DURATION_SEC;
    const segments = [
      { id: `${id}-seg-0`, durationSec, remainingSec: durationSec },
    ];

    const runningCard = deriveCardFromSegments(
      {
        id,
        title: "Break",
        notes: "",
        group: null,
        running: true,
        lastStartTs: now,
        overtime: false,
        createdAt: now,
        isBreak: true,
      },
      segments,
      {
        running: true,
        lastStartTs: now,
        remainingSecAtStart: segments[0]?.remainingSec ?? durationSec,
        activeSegmentIndex: 0,
        overtime: false,
      }
    );

    updateCardsState(
      (prev) => ({ ...prev, doing: [runningCard, ...(prev.doing || [])] }),
      { track: true }
    );
  };

  const updateCard = (colId, cardId, patch) => {
    const updater = typeof patch === "function" ? patch : (card) => ({ ...card, ...patch });
    setCardsByCol((prev) => ({
      ...prev,
      [colId]: (prev[colId] || []).map((c) => {
        if (c.id !== cardId) return c;
        const candidate = updater(c);
        if (candidate.segments) {
          const next = candidate.segments.length ? { ...candidate, stopwatch: null } : candidate;
          return deriveCardFromSegments({ ...next }, next.segments, next);
        }
        return candidate;
      }),
    }));
  };

  const clearCardTimer = (colId, cardId) => {
    updateCard(colId, cardId, {
      segments: [],
      durationSec: 0,
      remainingSec: 0,
      running: false,
      lastStartTs: null,
      remainingSecAtStart: 0,
      activeSegmentIndex: 0,
      overtime: false,
    });
    removeChimeSources([cardId]);
  };

  const startStopwatch = (colId, card) => {
    if (card.segments?.length) return;
    const now = Date.now();
    updateCard(colId, card.id, (current) => {
      const stopwatch = current.stopwatch;
      if (stopwatch?.running) return current;
      return {
        ...current,
        stopwatch: {
          elapsedSec: stopwatch?.elapsedSec || 0,
          running: true,
          lastStartTs: now,
        },
      };
    });
  };

  const pauseStopwatch = (colId, card) => {
    if (!card.stopwatch?.running || !card.stopwatch.lastStartTs) return;
    const now = Date.now();
    updateCard(colId, card.id, (current) => {
      const stopwatch = current.stopwatch;
      if (!stopwatch?.running || !stopwatch.lastStartTs) return current;
      return {
        ...current,
        stopwatch: {
          elapsedSec: (stopwatch.elapsedSec || 0) + (now - stopwatch.lastStartTs) / 1000,
          running: false,
          lastStartTs: null,
        },
      };
    });
  };

  const resetStopwatch = (colId, cardId) => {
    updateCard(colId, cardId, (current) => ({
      ...current,
      stopwatch: { elapsedSec: 0, running: false, lastStartTs: null },
    }));
  };

  const clearStopwatch = (colId, cardId) => {
    updateCard(colId, cardId, { stopwatch: null });
  };

  const updateSubtasks = (colId, cardId, updater) => {
    updateCardsState(
      (prev) => {
        const list = prev[colId] || [];
        const index = list.findIndex((card) => card.id === cardId);
        if (index === -1) return prev;
        const card = list[index];
        const currentSubtasks = card.subtasks || [];
        const subtasks = updater(currentSubtasks);
        if (subtasks === currentSubtasks) return prev;
        const nextList = [...list];
        nextList[index] = { ...card, subtasks };
        return { ...prev, [colId]: nextList };
      },
      { track: true }
    );
  };

  const applyTitleShortcuts = useCallback(
    (colId, cardId, rawTitle) => {
      const parsed = parseTimeFromTitle(rawTitle);
      const cleanTitle = parsed.cleanTitle?.trim() || "Untitled";
      const durations =
        parsed.segments && parsed.segments.length > 1
          ? parsed.segments
          : parsed.durationSec != null
          ? [parsed.durationSec]
          : null;

      updateCard(colId, cardId, (current) => {
        let next = { ...current, title: cleanTitle };

        if (parsed.groupId != null) {
          const nextGroup = parsed.groupId === "" ? null : parsed.groupId;
          if (nextGroup !== current.group) {
            next = { ...next, group: nextGroup };
          }
        }

        if (durations && durations.length) {
          const sanitized = durations.map((sec) => sanitizeSegmentDuration(sec));
          const segmentsPayload = sanitized.map((sec) => ({
            durationSec: sec,
            remainingSec: sec,
          }));
          const nextActiveIndex = findNextActiveSegment(segmentsPayload);
          next = {
            ...next,
            segments: segmentsPayload,
            running: false,
            lastStartTs: null,
            remainingSecAtStart: segmentsPayload[nextActiveIndex]?.remainingSec ?? 0,
            activeSegmentIndex: nextActiveIndex,
            overtime: false,
          };
        }

        return next;
      });
    },
    [updateCard]
  );

  const removeCard = (colId, cardId) => {
    updateCardsState(
      (prev) => {
        const list = prev[colId] || [];
        if (!list.some((c) => c.id === cardId)) return prev;
        return {
          ...prev,
          [colId]: list.filter((c) => c.id !== cardId),
        };
      },
      { track: true }
    );

    removeChimeSources([cardId]);
  };

  const clearColumn = (colId) => {
    let removedIds = [];
    updateCardsState(
      (prev) => {
        const existing = prev[colId] || [];
        if (!existing.length) return prev;
        removedIds = existing.map((card) => card.id);
        return { ...prev, [colId]: [] };
      },
      { track: true }
    );

    if (!removedIds.length) return;

    removeChimeSources(removedIds);
  };

  const moveCard = (fromCol, toCol, cardId, index = null) => {
    updateCardsState(
      (prev) => {
        const src = [...(prev[fromCol] || [])];
        const idx = src.findIndex((c) => c.id === cardId);
        if (idx === -1) return prev;
        const [card] = src.splice(idx, 1);
        if (fromCol === toCol) {
          let targetIndex = typeof index === "number" ? index : src.length;
          if (targetIndex < 0) targetIndex = 0;
          if (idx < targetIndex) targetIndex -= 1;
          if (targetIndex < 0) targetIndex = 0;
          if (targetIndex > src.length) targetIndex = src.length;
          src.splice(targetIndex, 0, card);
          return { ...prev, [fromCol]: src };
        }
        const dest = [...(prev[toCol] || [])];
        let targetIndex = typeof index === "number" ? index : dest.length;
        if (targetIndex < 0 || targetIndex > dest.length) targetIndex = dest.length;
        dest.splice(targetIndex, 0, card);
        return { ...prev, [fromCol]: src, [toCol]: dest };
      },
      { track: true }
    );
  };

  const startTimer = (colId, card) => {
    if (!card.segments?.length) return;
    console.log("[Timer] startTimer", { colId, cardId: card.id });
    const now = Date.now();
    updateCard(colId, card.id, (current) => {
      if (current.running) return current;
      const baseSegments = (current.segments && current.segments.length
        ? current.segments
        : [
            {
              id: `${current.id || card.id}-seg-0`,
              durationSec: current.durationSec ?? current.remainingSec ?? 1500,
              remainingSec: current.remainingSec ?? current.durationSec ?? 1500,
            },
          ]
      );
      let segments = baseSegments.map((seg) => ({ ...seg }));
      let activeIndex = findNextActiveSegment(segments);
      let activeSegment = segments[activeIndex];

      if (!activeSegment || activeSegment.remainingSec <= 0) {
        segments = segments.map((seg) => ({
          ...seg,
          remainingSec: seg.durationSec ?? seg.remainingSec ?? 0,
        }));
        activeIndex = findNextActiveSegment(segments);
        activeSegment = segments[activeIndex];
      }

      if (!activeSegment || activeSegment.remainingSec <= 0) {
        return {
          ...current,
          segments,
          running: false,
          lastStartTs: null,
          remainingSec: segments.reduce((sum, seg) => sum + (seg.remainingSec ?? 0), 0),
          remainingSecAtStart: 0,
          activeSegmentIndex: activeIndex ?? 0,
          overtime: false,
        };
      }
      return {
        ...current,
        segments,
        running: true,
        lastStartTs: now,
        remainingSecAtStart: activeSegment.remainingSec,
        activeSegmentIndex: activeIndex,
        remainingSec: segments.reduce((sum, seg) => sum + (seg.remainingSec ?? 0), 0),
        overtime: false,
      };
    });
  };

  const pauseTimer = (colId, card) => {
    console.log("[Timer] pauseTimer", { colId, cardId: card.id, running: card.running });
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
    console.log("[Timer] resetTimer", { colId, cardId: card.id });
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
      const now = Date.now();
      const existing = current.segments || [];
      const activeIndex = current.activeSegmentIndex ?? findNextActiveSegment(existing);
      const elapsed = current.running && current.lastStartTs ? Math.floor((now - current.lastStartTs) / 1000) : 0;

      const segments = durations.map((sec, idx) => {
        const prevSeg = existing[idx];
        if (!prevSeg) {
          return {
            id: `${current.id || card.id}-seg-${idx}-${uid()}`,
            durationSec: sec,
            remainingSec: sec,
          };
        }

        const prevDuration = prevSeg.durationSec && prevSeg.durationSec > 0 ? prevSeg.durationSec : sec;
        const remainingAtStart =
          idx === activeIndex && current.running && current.lastStartTs
            ? current.remainingSecAtStart ?? prevSeg.remainingSec ?? prevDuration
            : prevSeg.remainingSec ?? prevDuration;
        const updatedRemaining = idx === activeIndex ? clamp(remainingAtStart - elapsed, 0, prevDuration) : remainingAtStart;
        const elapsedWithinPrev = prevDuration - updatedRemaining;
        const nextRemaining = clamp(Math.floor(sec - elapsedWithinPrev), 0, sec);

        return {
          id: prevSeg?.id || `${current.id || card.id}-seg-${idx}-${uid()}`,
          durationSec: sec,
          remainingSec: nextRemaining,
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
    updateCardsState(
      (prev) => {
        const hasCards = Object.values(prev).some((list) => (list?.length ?? 0) > 0);
        if (!hasCards) return prev;
        const cleared = {};
        Object.keys(prev).forEach((key) => {
          cleared[key] = [];
        });
        return cleared;
      },
      { track: true }
    );
    setConfirmClearOpen(false);
  };

  const handleStart = (colId, card) => {
    const ctx = ensureAudioContext(audioRef);
    console.log("[Timer] handleStart invoked", { colId, cardId: card.id, autoMoveEnabled });
    if (ctx && ctx.state === "suspended") {
      const resumeResult = ctx.resume?.();
      if (resumeResult && typeof resumeResult.catch === "function") {
        resumeResult.catch(() => {});
      }
    }
    if (colId !== "todo" || !autoMoveEnabled) {
      console.log("[Timer] handleStart direct path", { colId, cardId: card.id });
      startTimer(colId, card);
      return;
    }
    console.log("[Timer] handleStart auto-move from todo", { cardId: card.id });
    setCardsByCol((prev) => {
      const src = [...(prev.todo || [])];
      const idx = src.findIndex((c) => c.id === card.id);
      if (idx === -1) return prev;
      const [item] = src.splice(idx, 1);
      const doing = [...(prev.doing || [])];
      const now = Date.now();
      let segments = (item.segments && item.segments.length
        ? item.segments
        : [
            {
              id: `${item.id}-seg-0`,
              durationSec: item.durationSec ?? item.remainingSec ?? 1500,
              remainingSec: item.remainingSec ?? item.durationSec ?? 1500,
            },
          ]
      ).map((seg) => ({ ...seg }));
      let activeIndex = findNextActiveSegment(segments);
      let activeSegment = segments[activeIndex];
      if (!activeSegment || activeSegment.remainingSec <= 0) {
        segments = segments.map((seg) => ({
          ...seg,
          remainingSec: seg.durationSec ?? seg.remainingSec ?? 0,
        }));
        activeIndex = findNextActiveSegment(segments);
        activeSegment = segments[activeIndex];
      }
      const runningCard =
        activeSegment && activeSegment.remainingSec > 0
          ? deriveCardFromSegments(
              { ...item, running: true, lastStartTs: now },
              segments,
              {
                running: true,
                lastStartTs: now,
                remainingSecAtStart: activeSegment.remainingSec,
                activeSegmentIndex: activeIndex ?? 0,
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
                activeSegmentIndex: activeIndex ?? 0,
                overtime: false,
              }
            );
      console.log("[Timer] auto-move start result", {
        cardId: runningCard.id,
        running: runningCard.running,
        lastStartTs: runningCard.lastStartTs,
        remainingSecAtStart: runningCard.remainingSecAtStart,
        activeSegmentIndex: runningCard.activeSegmentIndex,
        segmentSnapshot: runningCard.segments.map((seg, idx) => ({
          idx,
          remainingSec: seg.remainingSec,
          durationSec: seg.durationSec,
        })),
      });
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
    <div
      className="min-h-screen w-full"
      data-theme={theme}
      style={{ backgroundColor: palette.bg, color: palette.text }}
    >
      <Header
        onOpenHelp={() => setHelpOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleTheme={toggleTheme}
        onStartBreak={startBreak}
        onStopChime={stopLoopingChime}
        palette={palette}
        theme={theme}
        chimeActive={chimeActive}
        syncUser={taskSync.user}
        syncStatus={taskSync.status}
        syncConfigured={taskSync.configured}
        onSignIn={taskSync.signIn}
        onSignOut={taskSync.signOut}
        onOpenSyncSetup={() => setSyncSetupOpen(true)}
      />

      {taskSync.error && (
        <div role="alert" className="mx-auto mt-2 max-w-7xl px-4 text-sm" style={{ color: palette.dangerText }}>
          Task sync: {taskSync.error}
        </div>
      )}

      <div className="mx-auto max-w-7xl p-4">
        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-3">
          {columns.map((col) => {
            const visibleCards = filtered[col.id] || [];
            const totalCount = (materialized[col.id] || []).length;
            return (
              <Column
                key={col.id}
                column={col}
                cards={visibleCards}
                totalCount={totalCount}
                onDropCard={(cardId, fromCol, insertIndex) => moveCard(fromCol, col.id, cardId, insertIndex)}
                onAddCard={() => startDraftCard(col.id)}
                onClearColumn={() => setConfirmColumnClear({ colId: col.id, name: col.name })}
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
                    onClearTimer={() => clearCardTimer(col.id, card.id)}
                    onStartStopwatch={() => startStopwatch(col.id, card)}
                    onPauseStopwatch={() => pauseStopwatch(col.id, card)}
                    onResetStopwatch={() => resetStopwatch(col.id, card.id)}
                    onClearStopwatch={() => clearStopwatch(col.id, card.id)}
                    onUpdateProgress={(arr) => setCardProgress(col.id, card, arr)}
                    onChangeSubtasks={(updater) => updateSubtasks(col.id, card.id, updater)}
                    onRename={(nextTitle) => applyTitleShortcuts(col.id, card.id, nextTitle)}
                    onDraftCommit={() => {
                      updateCard(col.id, card.id, { isDraft: false });
                      startDraftCard(col.id);
                    }}
                    onDraftCancel={() => removeCard(col.id, card.id)}
                    index={index}
                    palette={palette}
                    isDark={isDark}
                    isChiming={chimeActive && loopingChimeSources.includes(card.id)}
                    onStopChime={stopLoopingChime}
                    autoFocusTitle={pendingTitleEditId === card.id}
                    onAutoFocusHandled={(handledId) =>
                      setPendingTitleEditId((current) => (current === handledId ? null : current))
                    }
                  />
                )}
                palette={palette}
                isDark={isDark}
              />
            );
          })}
        </div>
      </div>

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

      {confirmColumnClear && (
        <Modal
          title={`Clear ${confirmColumnClear.name}?`}
          onClose={() => setConfirmColumnClear(null)}
          palette={palette}
        >
          <div className="space-y-3">
            <p className="text-sm" style={{ color: palette.subtext }}>
              This removes every task in <em>{confirmColumnClear.name}</em>.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmColumnClear(null)}
                className="interactive-button rounded-xl px-3 py-2 text-sm"
                style={{ border: `1px solid ${palette.border}` }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  clearColumn(confirmColumnClear.colId);
                  setConfirmColumnClear(null);
                }}
                className="interactive-button rounded-xl px-3 py-2 text-sm font-medium"
                style={{ backgroundColor: palette.dangerBg, color: palette.dangerText }}
              >
                Clear column
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirmClearOpen && (
        <Modal title="Clear all tasks?" onClose={() => setConfirmClearOpen(false)} palette={palette}>
          <div className="space-y-3">
            <p className="text-sm" style={{ color: palette.subtext }}>
              This will remove every card in <em>Do</em>, <em>Doing</em>, and <em>Done</em>.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmClearOpen(false)}
                className="interactive-button rounded-xl px-3 py-2 text-sm"
                style={{ border: `1px solid ${palette.border}` }}
              >
                Cancel
              </button>
              <button
                onClick={doClearAll}
                className="interactive-button rounded-xl px-3 py-2 text-sm font-medium"
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
          autoMoveEnabled={autoMoveEnabled}
          setAutoMoveEnabled={setAutoMoveEnabled}
          onTest={() => playChime(audioRef, { type: sound.type, volume: sound.volume })}
          palette={palette}
          chimeActive={chimeActive}
          onStopChime={stopLoopingChime}
          onRequestClearAll={() => {
            setSettingsOpen(false);
            setConfirmClearOpen(true);
          }}
        />
      )}

      {helpOpen && (
        <HelpModal
          onClose={() => setHelpOpen(false)}
          palette={palette}
        />
      )}

      {syncSetupOpen && (
        <Modal title="Set up task sync" onClose={() => setSyncSetupOpen(false)} palette={palette}>
          <div className="space-y-3 text-sm" style={{ color: palette.subtext }}>
            <p>Google sign-in and cross-device sync need a Firebase project configured for Tasky. This is intentionally separate from Daymark.</p>
            <p>Create a Firebase web app, enable Google sign-in and Cloud Firestore, then add its web config to your local environment and GitHub repository variables.</p>
            <p>Until configured, Tasky continues saving your board in this browser as usual.</p>
            <a className="font-medium underline" style={{ color: palette.text }} href="https://github.com/brentcrosby/time-slice-kanban-board/blob/main/FIREBASE_SETUP.md" target="_blank" rel="noreferrer">Open the setup guide</a>
          </div>
        </Modal>
      )}

      {taskSync.conflict && (
        <Modal title="Choose which tasks to sync" onClose={() => taskSync.resolveConflict("merge")} palette={palette}>
          <div className="space-y-4 text-sm" style={{ color: palette.subtext }}>
            <p>This Google account already has a Tasky board, and this browser also has tasks saved locally. Merge them to keep both sets, or use the account board on this device.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button className="interactive-button rounded-md border px-3 py-2" style={{ borderColor: palette.border, color: palette.text }} onClick={() => taskSync.resolveConflict("remote")}>Use account board</button>
              <button className="interactive-button rounded-md px-3 py-2 font-medium" style={{ backgroundColor: palette.text, color: palette.bg }} onClick={() => taskSync.resolveConflict("merge")}>Merge device tasks</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
