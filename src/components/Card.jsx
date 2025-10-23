import React, { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Pencil, Trash2, VolumeX } from "lucide-react";
import { SegmentLimitEditor } from "./SegmentLimitEditor";
import { MIN_SEGMENT_SEC } from "../constants";
import { clamp } from "../utils/misc";
import { findNextActiveSegment } from "../utils/segments";
import { secsToHMS } from "../utils/time";
import { CARD_GROUPS } from "../constants/groups";

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
  onStart,
  onPause,
  onReset,
  onRemove,
  onEdit,
  onSetSegments,
  onUpdateProgress,
  index,
  palette,
  isDark = false,
  isChiming = false,
  onStopChime,
}) {
  const ref = useRef(null);
  const [limitEditorActive, setLimitEditorActive] = useState(false);
  const segments = (card.segments && card.segments.length
    ? card.segments
    : [
        {
          id: `${card.id}-seg-0`,
          durationSec: card.durationSec ?? card.remainingSec ?? MIN_SEGMENT_SEC,
          remainingSec: card.remainingSec ?? card.durationSec ?? MIN_SEGMENT_SEC,
        },
      ]
  ).map((seg) => ({ ...seg }));
  const isSegmented = (card.segments?.length || 0) > 1;
  const totalDuration = segments.reduce((sum, seg) => sum + (seg.durationSec ?? 0), 0) || 1;
  const totalRemaining = segments.reduce((sum, seg) => sum + (seg.remainingSec ?? 0), 0);
  const baseIsOver = totalRemaining <= 0;
  const activeIdx = card.activeSegmentIndex ?? findNextActiveSegment(segments);
  const activeRemainingRaw = card.computedActiveRemaining ?? segments[activeIdx]?.remainingSec ?? 0;
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

  const updateDrag = (ratio) => {
    setDragState({ active: true, ratio, displaySec: Math.max(totalDuration - ratio * totalDuration, 0) });
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
    if (limitEditorActive) {
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

  const controlButtonClass =
    "interactive-button rounded-md p-1 transition-colors hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/30";

  const groupColors = card.group ? CARD_GROUPS[card.group]?.colors?.[isDark ? "dark" : "light"] : null;
  const cardBackgroundColor = groupColors?.cardBg ?? palette.card;
  const cardBorderColor = groupColors?.cardBorder ?? palette.border;
  const cardTextColor = groupColors?.cardText ?? palette.text;
  const cardSubtextColor = groupColors?.cardSubtext ?? palette.subtext;
  const barBgColor = groupColors
    ? adjustColorTone(palette.barBg, isDark ? 0.4 : -0.35)
    : palette.barBg;
  const barFillColor = groupColors
    ? adjustColorTone(palette.barFill, isDark ? 0.45 : -0.4)
    : palette.barFill;
  const hoveredBarBgColor = adjustColorTone(barBgColor, isDark ? 0.45 : -0.35);
  const hoveredBarFillColor = adjustColorTone(barFillColor, isDark ? 0.35 : -0.35);

  const overlaySegment = overlayDisplayIdx != null ? segments[overlayDisplayIdx] : null;
  const overlayMeta = overlayDisplayIdx != null ? segmentFlexMeta[overlayDisplayIdx] : null;
  const showHoverOverlay = Boolean(overlaySegment && overlayMeta);

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
      draggable={!limitEditorActive}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-card-id={card.id}
      className="relative interactive-card group rounded-xl p-3 shadow-sm"
      style={{
        backgroundColor: cardBackgroundColor,
        border: `1px solid ${cardBorderColor}`,
        zIndex: limitEditorActive ? 200 : undefined,
      }}
    >
      <div className="mb-2 flex items-start gap-2">
        <div className="flex-1">
          <h3 className="text-sm font-semibold" style={{ color: cardTextColor }}>
            {card.title}
          </h3>
          {card.notes ? (
            <p className="mt-1 text-xs whitespace-pre-wrap" style={{ color: cardSubtextColor }}>
              {card.notes}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {isChiming ? (
            <button
              onClick={onStopChime}
              title="Mute chime"
              aria-label="Mute chime"
              className={controlButtonClass}
              style={{ color: cardSubtextColor }}
            >
              <VolumeX className="h-4 w-4" />
            </button>
          ) : card.running ? (
            <button
              onClick={onPause}
              title="Pause"
              aria-label="Pause"
              className={controlButtonClass}
              style={{ color: cardSubtextColor }}
            >
              <Pause className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={onStart}
              title="Start"
              aria-label="Start"
              className={controlButtonClass}
              style={{ color: cardSubtextColor }}
            >
              <Play className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onReset}
            title="Reset"
            aria-label="Reset"
            className={controlButtonClass}
            style={{ color: cardSubtextColor }}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={onEdit}
            title="Edit"
            aria-label="Edit"
            className={controlButtonClass}
            style={{ color: cardSubtextColor }}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onRemove}
            title="Delete"
            aria-label="Delete"
            className={controlButtonClass}
            style={{ color: cardSubtextColor }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
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
              ? "#fda4af"
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
        <div className="mt-1 flex items-center justify-between text-xs" style={{ color: cardSubtextColor }}>
          <span className={`${isOver ? "font-semibold" : ""}`} style={{ color: isOver ? "#b91c1c" : cardSubtextColor }}>
            {visualActiveRemaining < 0
              ? `Over: ${secsToHMS(Math.abs(visualActiveRemaining))}`
              : secsToHMS(Math.max(visualActiveRemaining, 0))}
          </span>
          <SegmentLimitEditor
            card={card}
            onSetSegments={onSetSegments}
            palette={palette}
            onEditingChange={setLimitEditorActive}
          />
        </div>
      </div>

    </article>
  );
}
