import React, { useRef, useState } from "react";
import { Play, Pause, RotateCcw, Pencil, Trash2, VolumeX } from "lucide-react";
import { SegmentLimitEditor } from "./SegmentLimitEditor";
import { MIN_SEGMENT_SEC } from "../constants";
import { clamp } from "../utils/misc";
import { findNextActiveSegment } from "../utils/segments";
import { secsToHMS } from "../utils/time";

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
  const totalDuration = segments.reduce((sum, seg) => sum + (seg.durationSec ?? 0), 0) || 1;
  const totalRemaining = segments.reduce((sum, seg) => sum + (seg.remainingSec ?? 0), 0);
  const baseIsOver = totalRemaining <= 0;
  const activeIdx = card.activeSegmentIndex ?? findNextActiveSegment(segments);
  const activeRemainingRaw = card.computedActiveRemaining ?? segments[activeIdx]?.remainingSec ?? 0;
  const activeRemaining = Math.max(activeRemainingRaw, 0);
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
  const visualActiveRemaining = dragState.active ? previewRemainings[visualActiveIndex] ?? 0 : activeRemainingRaw;
  const visualTotalRemaining = dragState.active
    ? previewRemainings.reduce((sum, val) => sum + val, 0)
    : card.remainingSec ?? totalRemaining;
  const isOver = dragState.active ? visualTotalRemaining <= 0 : baseIsOver;

  const onDragStart = (event) => {
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

  return (
    <article
      ref={ref}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-card-id={card.id}
      className={`relative interactive-card group rounded-xl p-3 shadow-sm ${isOver ? "ring-1" : ""}`}
      style={{
        backgroundColor: palette.card,
        border: `1px solid ${palette.border}`,
        zIndex: limitEditorActive ? 200 : undefined,
      }}
    >
      <div className="mb-2 flex items-start gap-2">
        <div className="flex-1">
          <h3 className="text-sm font-semibold" style={{ color: palette.text }}>
            {card.title}
          </h3>
          {card.notes ? (
            <p className="mt-1 text-xs whitespace-pre-wrap" style={{ color: palette.subtext }}>
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
              style={{ color: palette.subtext }}
            >
              <VolumeX className="h-4 w-4" />
            </button>
          ) : card.running ? (
            <button
              onClick={onPause}
              title="Pause"
              aria-label="Pause"
              className={controlButtonClass}
              style={{ color: palette.subtext }}
            >
              <Pause className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={onStart}
              title="Start"
              aria-label="Start"
              className={controlButtonClass}
              style={{ color: palette.subtext }}
            >
              <Play className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onReset}
            title="Reset"
            aria-label="Reset"
            className={controlButtonClass}
            style={{ color: palette.subtext }}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={onEdit}
            title="Edit"
            aria-label="Edit"
            className={controlButtonClass}
            style={{ color: palette.subtext }}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onRemove}
            title="Delete"
            aria-label="Delete"
            className={controlButtonClass}
            style={{ color: palette.subtext }}
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
            return (
              <div
                key={seg.id || `${card.id}-seg-${idx}`}
                className="relative flex-1 overflow-hidden rounded-full"
                style={{
                  backgroundColor: palette.barBg,
                  flexGrow: seg.durationSec || 1,
                }}
              >
                <div
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${progress * 100}%`,
                    backgroundColor: isOver ? "#fda4af" : palette.barFill,
                    transition: "width 0.2s ease",
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex items-center justify-between text-xs" style={{ color: palette.subtext }}>
          <span className={`${isOver ? "font-semibold" : ""}`} style={{ color: isOver ? "#b91c1c" : palette.subtext }}>
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
