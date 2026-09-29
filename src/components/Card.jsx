import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { CalendarDays, Flag, Check, Play, Pause, RotateCcw, VolumeX, Timer, ListPlus, Pencil, Trash2 } from "lucide-react";
import { CardActions } from "./CardActions";
import { TaskTitleInput } from "./TaskTitleInput";
import { StopwatchControls } from "./StopwatchControls";
import { StopwatchReadout } from "./StopwatchReadout";
import { SegmentLimitEditor } from "./SegmentLimitEditor";
import { Subtasks } from "./Subtasks";
import { MIN_SEGMENT_SEC } from "../constants";
import { clamp } from "../utils/misc";
import { findNextActiveSegment } from "../utils/segments";
import { secsToHMS } from "../utils/time";
import { CARD_GROUPS } from "../constants/groups";
import { TASK_CONTENT_INSET } from "../constants/layout";
import { formatDueDate, localDateKey } from "../utils/dueDates";
import { parseTaskTitle } from "../utils/taskTitle";

const adjustColorTone = (hex, factor) => {
  if (typeof hex !== "string" || !hex.startsWith("#")) return hex;
  const normalized = hex.replace("#", "");
  const expand = normalized.length === 3
    ? normalized
        .split("")
        .map((char) => char + char)
        .join("")
    : normalized;
  if (expand.length !== 6) return hex;
  const num = parseInt(expand, 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const target = factor > 0 ? 255 : 0;
  const pct = Math.min(Math.abs(factor), 1);
  const blend = (value) => Math.round(value + (target - value) * pct);
  const next = (value) => Math.max(0, Math.min(255, blend(value)));
  const rr = next(r).toString(16).padStart(2, "0");
  const gg = next(g).toString(16).padStart(2, "0");
  const bb = next(b).toString(16).padStart(2, "0");
  return `#${rr}${gg}${bb}`;
};

export function Card({
  card,
  colId,
  pinnedControls = [],
  onMove,
  onStart,
  onPause,
  onReset,
  onRemove,
  onEdit,
  onSetSegments,
  onClearTimer,
  onStartStopwatch,
  onPauseStopwatch,
  onResetStopwatch,
  onClearStopwatch,
  onEditStopwatchElapsed,
  onUpdateProgress,
  onChangeSubtasks,
  onToggleSubtaskStopwatch,
  onToggleFlag,
  onSelect,
  onSetSelectionAnchor,
  selected = false,
  selectionActive = false,
  isCut = false,
  onRename = () => {},
  index,
  palette,
  isDark = false,
  isChiming = false,
  onStopChime,
  autoFocusTitle = false,
  onAutoFocusHandled = () => {},
  onDraftCommit = () => {},
  onDraftCancel = () => {},
}) {
  const ref = useRef(null);
  // A new draft mounts its input during the Add task tap, while iOS still
  // allows that tap to open the software keyboard.
  const [isTitleEditing, setIsTitleEditing] = useState(autoFocusTitle);
  const [titleDraft, setTitleDraft] = useState(card.title ?? "");
  const titleInputRef = useRef(null);
  // Close each edit session once: Enter, blur, and a tap can arrive together.
  const titleEditActiveRef = useRef(autoFocusTitle);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [featureEditing, setFeatureEditing] = useState(false);
  const [subtaskComposerOpen, setSubtaskComposerOpen] = useState(false);
  const [subtaskMenuOpen, setSubtaskMenuOpen] = useState(false);
  const hasTimer = Boolean((card.segments?.length || 0) > 0 || card.durationSec > 0 || card.remainingSec > 0);
  const hasStopwatch = Boolean(card.stopwatch);
  const stopwatchRunning = Boolean(card.stopwatch?.running);
  const stopwatchElapsed = card.computedStopwatchElapsed ?? card.stopwatch?.elapsedSec ?? 0;
  const segments = hasTimer
    ? (card.segments && card.segments.length
      ? card.segments
      : [
        {
          id: `${card.id}-seg-0`,
          durationSec: card.durationSec ?? card.remainingSec ?? MIN_SEGMENT_SEC,
          remainingSec: card.remainingSec ?? card.durationSec ?? MIN_SEGMENT_SEC,
        },
      ]
    ).map((seg) => ({ ...seg }))
    : [];
  const isSegmented = (card.segments?.length || 0) > 1;
  const totalDuration = segments.reduce((sum, seg) => sum + (seg.durationSec ?? 0), 0) || 1;
  const totalRemaining = segments.reduce((sum, seg) => sum + (seg.remainingSec ?? 0), 0);
  const baseIsOver = hasTimer && totalRemaining <= 0;
  const activeIdx = hasTimer ? card.activeSegmentIndex ?? findNextActiveSegment(segments) : 0;
  const activeRemainingRaw = hasTimer ? card.computedActiveRemaining ?? segments[activeIdx]?.remainingSec ?? 0 : 0;
  const activeRemaining = Math.max(activeRemainingRaw, 0);
  const barRef = useRef(null);
  const dragPointerIdRef = useRef(null);
  const [dragState, setDragState] = useState({ active: false, ratio: 0, displaySec: 0 });
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [overlayIdx, setOverlayIdx] = useState(null);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const hoverDelayRef = useRef(null);
  const overlayHideRef = useRef(new Map());
  const HOVER_DELAY_MS = 120;
  const OVERLAY_FADE_MS = 150;

  useEffect(() => {
    return () => {
      if (hoverDelayRef.current) {
        clearTimeout(hoverDelayRef.current);
        hoverDelayRef.current = null;
      }
      const hideMap = overlayHideRef.current;
      if (hideMap.size) {
        hideMap.forEach((timeoutId) => clearTimeout(timeoutId));
        hideMap.clear();
      }
    };
  }, []);

  useEffect(() => {
    if (!isTitleEditing) {
      setTitleDraft(card.title ?? "");
    }
  }, [card.title, isTitleEditing]);

  useLayoutEffect(() => {
    if (!isTitleEditing) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [isTitleEditing]);

  const segmentFlexMeta = useMemo(() => {
    if (!segments.length) return [];
    const units = segments.map((seg) => {
      const duration = seg.durationSec ?? 0;
      return duration > 0 ? duration : 1;
    });
    const totalUnits = units.reduce((sum, val) => sum + val, 0) || 1;
    let accumulator = 0;
    return segments.map((_, idx) => {
      const unit = units[idx] || 1;
      const startRatio = accumulator / totalUnits;
      const widthRatio = unit / totalUnits;
      accumulator += unit;
      return { startRatio, widthRatio };
    });
  }, [segments]);

  const safeHoveredIdx = isSegmented && hoveredIdx != null && hoveredIdx >= 0 && hoveredIdx < segments.length
    ? hoveredIdx
    : null;
  const overlayDisplayIdx = !dragState.active && overlayIdx != null && overlayIdx >= 0 && overlayIdx < segments.length
    ? overlayIdx
    : null;

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

  const computeDisplaySecFromRatio = (ratio) => {
    if (!segments.length) return 0;
    const normalized = clamp(ratio, 0, 1);
    const elapsed = totalDuration * normalized;
    if (!isSegmented) return elapsed;
    let segmentStart = 0;
    for (let idx = 0; idx < segments.length; idx += 1) {
      const duration = Math.max(segments[idx]?.durationSec ?? 0, 0);
      const segmentEnd = segmentStart + duration;
      if (elapsed <= segmentEnd || idx === segments.length - 1) {
        const within = elapsed - segmentStart;
        return Math.max(Math.min(within, duration), 0);
      }
      segmentStart = segmentEnd;
    }
    return 0;
  };

  const updateDrag = (ratio) => {
    setDragState({ active: true, ratio, displaySec: computeDisplaySecFromRatio(ratio) });
  };

  const handlePointerDown = (event) => {
    if (!onUpdateProgress) return;
    event.preventDefault();
    event.stopPropagation();
    if (isSegmented) {
      setHoveredIdx(null);
      if (hoverDelayRef.current) {
        clearTimeout(hoverDelayRef.current);
        hoverDelayRef.current = null;
      }
      if (overlayHideRef.current.size) {
        overlayHideRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
        overlayHideRef.current.clear();
      }
      setOverlayVisible(false);
      setOverlayIdx(null);
    }
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
  const visualActiveRemaining = dragState.active ? previewRemainings[visualActiveIndex] ?? 0 : activeRemainingRaw;
  const visualTotalRemaining = dragState.active
    ? previewRemainings.reduce((sum, val) => sum + val, 0)
    : card.remainingSec ?? totalRemaining;
  const isOver = dragState.active ? visualTotalRemaining <= 0 : baseIsOver;

  const onDragStart = (event) => {
    if (optionsOpen || event.target.closest?.("[data-subtasks]")) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData(
      "application/x-card",
      JSON.stringify({ cardId: card.id, fromCol: colId, fromIndex: index })
    );
    event.dataTransfer.effectAllowed = "move";
    ref.current?.classList.add("opacity-60");
  };

  const onDragEnd = () => ref.current?.classList.remove("opacity-60");

  const titleButtonClass =
    "inline-block max-w-full cursor-text rounded-md border-0 bg-transparent p-0 text-left text-base font-semibold leading-tight md:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/30";

  const groupColors = card.group ? CARD_GROUPS[card.group]?.colors?.[isDark ? "dark" : "light"] : null;
  const cardBackgroundColor = groupColors?.cardBg ?? palette.card;
  const cardBorderColor = groupColors?.cardBorder ?? palette.border;
  const cardTextColor = groupColors?.cardText ?? palette.text;
  const cardSubtextColor = groupColors?.cardSubtext ?? palette.subtext;
  const barBgColor = groupColors
    ? adjustColorTone(palette.barBg, isDark ? 0.15 : -0.15)
    : palette.barBg;
  const barFillColor = groupColors
    ? adjustColorTone(palette.barFill, isDark ? 0.45 : -0.4)
    : palette.barFill;
  const hoveredBarBgColor = adjustColorTone(barBgColor, isDark ? 0.45 : -0.35);
  const hoveredBarFillColor = adjustColorTone(barFillColor, isDark ? 0.35 : -0.35);

  const overlaySegment = overlayDisplayIdx != null ? segments[overlayDisplayIdx] : null;
  const overlayMeta = overlayDisplayIdx != null ? segmentFlexMeta[overlayDisplayIdx] : null;
  const showHoverOverlay = Boolean(overlaySegment && overlayMeta);

  const handleTitleCommit = useCallback(() => {
    if (!titleEditActiveRef.current) return true;
    titleEditActiveRef.current = false;
    const trimmed = (titleInputRef.current?.value ?? titleDraft).trim();
    setIsTitleEditing(false);
    if (!trimmed) {
      setTitleDraft(card.title ?? "");
      if (card.isDraft) onDraftCancel();
      return !card.isDraft;
    }
    setTitleDraft(trimmed);
    if (card.isDraft || trimmed !== card.title) onRename(trimmed);
    if (parseTaskTitle(trimmed).openSubtaskEditor) {
      // Commit and focus the subtask input while the user's keyboard action is active.
      flushSync(() => setSubtaskComposerOpen(true));
    }
    return true;
  }, [card.title, card.isDraft, onDraftCancel, onRename, titleDraft]);

  const handleTitleCancel = useCallback(() => {
    if (!titleEditActiveRef.current) return;
    titleEditActiveRef.current = false;
    setIsTitleEditing(false);
    setTitleDraft(card.title ?? "");
    if (card.isDraft) onDraftCancel();
  }, [card.title, card.isDraft, onDraftCancel]);

  const startTitleEditing = useCallback(() => {
    titleEditActiveRef.current = true;
    setTitleDraft(card.title ?? "");
    setIsTitleEditing(true);
  }, [card.title]);

  useLayoutEffect(() => {
    if (autoFocusTitle) onAutoFocusHandled(card.id);
  }, [autoFocusTitle, onAutoFocusHandled, card.id]);

  const handleTitleKeyDown = (event) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter") {
      event.preventDefault();
      const committedTitle = (titleInputRef.current?.value ?? titleDraft).trim();
      if (handleTitleCommit() && card.isDraft && !parseTaskTitle(committedTitle).openSubtaskEditor) onDraftCommit(committedTitle);
    } else if (event.key === "Escape") {
      event.preventDefault();
      handleTitleCancel();
    }
  };

  // iOS keyboard Done/checkmark dismisses the field without sending Enter.
  const handleTitleBlur = () => handleTitleCommit();

  const handleTitleInputPointerDown = (event) => {
    event.stopPropagation();
  };


  const handleSegmentEnter = (idx) => {
    if (!isSegmented) return;
    setHoveredIdx(idx);
    if (hoverDelayRef.current) {
      clearTimeout(hoverDelayRef.current);
      hoverDelayRef.current = null;
    }
    const hideMap = overlayHideRef.current;
    const pendingHide = hideMap.get(idx);
    if (pendingHide) {
      clearTimeout(pendingHide);
      hideMap.delete(idx);
    }
    if (overlayIdx !== idx || !overlayVisible) {
      setOverlayVisible(false);
    }
    hoverDelayRef.current = window.setTimeout(() => {
      hoverDelayRef.current = null;
      setOverlayIdx(idx);
      setOverlayVisible(true);
    }, HOVER_DELAY_MS);
  };

  const handleSegmentLeave = (idx) => {
    if (!isSegmented) return;
    setHoveredIdx((current) => (current === idx ? null : current));
    if (hoverDelayRef.current) {
      clearTimeout(hoverDelayRef.current);
      hoverDelayRef.current = null;
    }
    setOverlayVisible(false);
    if (overlayIdx === idx) {
      const hideMap = overlayHideRef.current;
      const pendingHide = hideMap.get(idx);
      if (pendingHide) {
        clearTimeout(pendingHide);
        hideMap.delete(idx);
      }
      const timeoutId = window.setTimeout(() => {
        setOverlayIdx((current) => (current === idx ? null : current));
        hideMap.delete(idx);
      }, OVERLAY_FADE_MS);
      hideMap.set(idx, timeoutId);
    }
  };

  return (
    <article
      ref={ref}
      draggable={!isTitleEditing && !optionsOpen && !featureEditing && !subtaskMenuOpen}
      tabIndex={0}
      aria-label={`${card.title || "Task"}${card.flagged ? ", important" : ""}${selected ? ", selected" : ""}`}
      onPointerDownCapture={(event) => {
        // Keep the tapped control in place until its click has saved the title
        // and run the action. This also prevents blur from beating Cancel.
        if (isTitleEditing && event.target.closest("button, summary") &&
          event.target.closest("[data-card-controls], [data-card-actions], [data-title-editor]")) {
          event.preventDefault();
        }
        if ((event.metaKey || event.ctrlKey || event.shiftKey) && !event.target.closest('input, textarea, [contenteditable="true"], [data-subtasks]')) event.preventDefault();
      }}
      onClickCapture={(event) => {
        if (isTitleEditing && event.target.closest("button, summary") &&
          event.target.closest("[data-card-controls], [data-card-actions]") &&
          !handleTitleCommit()) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (card.isDraft || event.target.closest('input, textarea, select, [contenteditable="true"], [data-subtasks], [data-card-actions], [data-card-controls], [data-title-editor]')) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          onSelect?.(event);
        } else onSetSelectionAnchor?.(card.id);
      }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === " " || event.key === "Enter")) {
          event.preventDefault();
          onSelect?.(event);
        }
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-card-id={card.id}
      className={`relative interactive-card group rounded-xl shadow-sm ${
        hasTimer ? "" : "flex flex-col justify-center"
      }`}
      style={{
        padding: TASK_CONTENT_INSET,
        backgroundColor: cardBackgroundColor,
        border: `1px solid ${cardBorderColor}`,
        zIndex: optionsOpen || featureEditing || subtaskMenuOpen ? 30 : undefined,
        outline: selected ? `2px solid ${palette.text}` : undefined,
        outlineOffset: selected ? 2 : undefined,
        opacity: isCut ? 0.5 : undefined,
        boxShadow: card.flagged ? "inset 3px 0 0 #d97706" : undefined,
      }}
    >
      <div className={`${hasTimer ? "mb-2 " : ""}flex flex-wrap items-center gap-2`}>
        {card.flagged && <button type="button" data-card-controls title="Remove priority flag" aria-label="Remove priority flag" onClick={onToggleFlag} className="interactive-button shrink-0 rounded-md p-1 hover:bg-black/10" style={{ color: isDark ? "#fbbf24" : "#b45309" }}><Flag className="h-4 w-4" fill="currentColor" /></button>}
        {selectionActive && <button type="button" role="checkbox" aria-checked={selected} aria-label={`Select ${card.title || "task"}`} onClick={(event) => onSelect?.({ ...event, metaKey: true })} className="flex h-5 w-5 shrink-0 items-center justify-center rounded border" style={{ borderColor: palette.text, backgroundColor: selected ? palette.text : "transparent", color: palette.bg }}>{selected && <Check size={14} />}</button>}
        <div className="min-w-[5rem] flex-1">
          {isTitleEditing ? (
            <TaskTitleInput
              ref={titleInputRef}
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onKeyDown={handleTitleKeyDown}
              onBlur={handleTitleBlur}
              onPointerDown={handleTitleInputPointerDown}
              color={cardTextColor}
              borderColor={cardBorderColor}
              palette={palette}
              isDark={isDark}
            />
          ) : (
            <button
              type="button"
              data-card-title
              onClick={() => flushSync(startTitleEditing)}
              className={titleButtonClass}
              style={{ color: cardTextColor }}
            >
              {card.title}
            </button>
          )}
          {card.notes ? (
            <p className="mt-1 whitespace-pre-wrap text-sm md:text-xs" style={{ color: cardSubtextColor }}>
              {card.notes}
            </p>
          ) : null}
          {card.dueDate && <button
            type="button"
            data-card-controls
            title="Edit due date"
            aria-label={`${formatDueDate(card)}. Edit due date`}
            onClick={onEdit}
            className="interactive-button mt-1 flex max-w-full items-center gap-1 rounded-md text-left text-sm md:text-xs"
            style={{ color: colId !== "done" && card.dueDate < localDateKey() ? palette.dangerText : cardSubtextColor }}
          >
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{formatDueDate(card)}</span>
          </button>}
        </div>
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-1">
        {isChiming && <button type="button" data-card-controls className="interactive-button rounded-md p-2 hover:bg-black/10 md:p-1" style={{ color: cardSubtextColor }} title="Mute chime" aria-label="Mute chime" onClick={onStopChime}><VolumeX size={16} /></button>}
        {hasStopwatch && <StopwatchControls running={stopwatchRunning} elapsed={stopwatchElapsed} onStart={onStartStopwatch} onPause={onPauseStopwatch} onReset={onResetStopwatch} onRemove={onClearStopwatch} onEdit={onEditStopwatchElapsed} color={cardSubtextColor} palette={palette} onEditingChange={setFeatureEditing} />}
        {card.computedSubtaskStopwatchElapsed != null && <StopwatchReadout elapsed={card.computedSubtaskStopwatchElapsed} label="Total subtask stopwatch time" palette={palette} color={cardSubtextColor} />}
        {hasTimer && <div data-card-controls className="flex items-center gap-1" style={{ color: cardSubtextColor }}>
          <button type="button" className="interactive-button rounded-md p-2 hover:bg-black/10 md:p-1" title={card.running ? "Pause timer" : "Start timer"} aria-label={card.running ? "Pause timer" : "Start timer"} onClick={card.running ? onPause : onStart}>{card.running ? <Pause size={16} /> : <Play size={16} />}</button>
          <button type="button" className="interactive-button rounded-md p-2 hover:bg-black/10 md:p-1" title="Reset timer" aria-label="Reset timer" onClick={onReset}><RotateCcw size={16} /></button>
        </div>}
        <div data-card-controls className="flex flex-wrap items-center justify-end gap-1" style={{ color: cardSubtextColor }}>
          {pinnedControls.includes("stopwatch") && !hasStopwatch && !hasTimer && <button type="button" className="interactive-button rounded-md p-2 hover:bg-black/10 md:p-1" title="Start stopwatch" aria-label="Start stopwatch" onClick={onStartStopwatch}><Timer size={16} /></button>}
          {pinnedControls.includes("timer") && !hasStopwatch && !hasTimer && <SegmentLimitEditor card={card} onSetSegments={onSetSegments} palette={palette} subtextColor={cardSubtextColor} borderColor={cardBorderColor} onEditingChange={setFeatureEditing} />}
          {pinnedControls.includes("subtasks") && <button type="button" className="interactive-button rounded-md p-2 hover:bg-black/10 md:p-1" title="Add subtask" aria-label="Add subtask" onClick={() => setSubtaskComposerOpen(true)}><ListPlus size={16} /></button>}
          {pinnedControls.includes("flag") && !card.flagged && <button type="button" className="interactive-button rounded-md p-2 hover:bg-black/10 md:p-1" title="Flag as important" aria-label="Flag as important" onClick={onToggleFlag}><Flag size={16} /></button>}
          {pinnedControls.includes("edit") && <button type="button" className="interactive-button rounded-md p-2 hover:bg-black/10 md:p-1" title="Edit task" aria-label="Edit task" onClick={onEdit}><Pencil size={16} /></button>}
          {pinnedControls.includes("delete") && <button type="button" className="interactive-button rounded-md p-2 hover:bg-black/10 md:p-1" title="Delete task" aria-label="Delete task" onClick={onRemove}><Trash2 size={16} /></button>}
        </div>
        <CardActions
          card={card} hasTimer={hasTimer} hasStopwatch={hasStopwatch}
          colId={colId} onMove={onMove}
          palette={palette} color={cardSubtextColor} borderColor={cardBorderColor}
          onSetSegments={onSetSegments} onStartStopwatch={onStartStopwatch}
          onAddSubtask={() => setSubtaskComposerOpen(true)} onToggleFlag={onToggleFlag}
          onSelect={() => onSelect?.({ metaKey: true })} onOpenChange={setOptionsOpen}
          onEdit={onEdit} onRemove={onRemove}
        />
        </div>
      </div>

      {isTitleEditing && (
        <div data-title-editor className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleTitleCancel}
            className="interactive-button min-h-[44px] rounded-lg px-3 text-sm"
            style={{ color: cardSubtextColor }}
          >Cancel</button>
          <button
            type="button"
            onClick={handleTitleCommit}
            disabled={!titleDraft.trim()}
            className="interactive-button flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 text-sm font-medium disabled:opacity-40"
            style={{ color: cardTextColor, borderColor: cardBorderColor, backgroundColor: palette.surface }}
          ><Check size={16} />Save</button>
        </div>
      )}

      {hasTimer ? <div className="mb-2">
        <div
          ref={barRef}
          draggable={false}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          className="relative flex h-2 w-full items-stretch gap-[2px] select-none"
          style={{ cursor: dragState.active ? "ew-resize" : undefined }}
        >
          {showHoverOverlay && (
            <div
              className="pointer-events-none absolute -top-7 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-medium shadow-md"
              style={{
                left: `${(overlayMeta.startRatio + overlayMeta.widthRatio / 2) * 100}%`,
                transform: "translateX(-50%)",
                backgroundColor: palette.surface,
                border: `1px solid ${palette.border}`,
                color: palette.text,
                zIndex: 50,
                opacity: overlayVisible ? 1 : 0,
                transition: `opacity ${OVERLAY_FADE_MS}ms ease`,
              }}
            >
              {secsToHMS(Math.round(overlaySegment?.durationSec ?? 0))}
            </div>
          )}
          {dragState.active && (
            <>
              <div
                className="pointer-events-none absolute -top-6 rounded-full px-2 py-1 text-[10px] font-medium"
                style={{
                  left: `${dragState.ratio * 100}%`,
                  transform: "translateX(-50%)",
                  backgroundColor: palette.surface,
                  border: `1px solid ${palette.border}`,
                  color: palette.text,
                  boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
                }}
              >
                {secsToHMS(Math.round(dragState.displaySec))}
              </div>
              <div
                className="pointer-events-none absolute inset-y-[-4px] w-px"
                style={{
                  left: `${dragState.ratio * 100}%`,
                  transform: "translateX(-0.5px)",
                  backgroundColor: palette.text,
                  opacity: 0.6,
                }}
              />
            </>
          )}
          {segments.map((seg, idx) => {
            const progress = visualProgressList[idx] ?? 0;
            const isActive = idx === visualActiveIndex;
            const isHovered = safeHoveredIdx === idx;
            const segmentBackground = isSegmented && isHovered ? hoveredBarBgColor : barBgColor;
            const segmentFill = isOver
              ? palette.overFill
              : isSegmented && isHovered
              ? hoveredBarFillColor
              : barFillColor;
            return (
              <div
                key={seg.id || `${card.id}-seg-${idx}`}
                className="relative flex-1 overflow-hidden rounded-full"
                style={{
                  backgroundColor: segmentBackground,
                  flexGrow: seg.durationSec || 1,
                  transition: "background-color 0.15s ease, box-shadow 0.15s ease",
                  boxShadow: isSegmented && isHovered ? `0 0 0 1px ${palette.text}25` : undefined,
                  zIndex: isSegmented && isHovered ? 2 : 1,
                }}
                onPointerEnter={isSegmented ? () => handleSegmentEnter(idx) : undefined}
                onPointerLeave={isSegmented ? () => handleSegmentLeave(idx) : undefined}
              >
                <div
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${progress * 100}%`,
                    backgroundColor: segmentFill,
                    transition: "width 0.2s ease, background-color 0.15s ease",
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex items-center justify-between text-sm md:text-xs" style={{ color: cardSubtextColor }}>
          <span className={`${isOver ? "font-semibold" : ""}`} style={{ color: isOver ? palette.overText : cardSubtextColor }}>
            {visualActiveRemaining < 0
              ? `Over: ${secsToHMS(Math.abs(visualActiveRemaining))}`
              : secsToHMS(Math.max(visualActiveRemaining, 0))}
          </span>
          <div data-card-controls>
            <SegmentLimitEditor card={card} onSetSegments={onSetSegments} onRemoveTimer={onClearTimer} palette={palette} subtextColor={cardSubtextColor} borderColor={cardBorderColor} onEditingChange={setFeatureEditing} />
          </div>
        </div>
      </div> : null}

      <Subtasks
        cardId={card.id}
        subtasks={card.subtasks || []}
        adding={subtaskComposerOpen}
        onAddingChange={setSubtaskComposerOpen}
        onChange={onChangeSubtasks}
        onToggleStopwatch={onToggleSubtaskStopwatch}
        onMenuOpenChange={setSubtaskMenuOpen}
        palette={palette}
        textColor={cardTextColor}
        subtextColor={cardSubtextColor}
        borderColor={cardBorderColor}
      />

    </article>
  );
}
