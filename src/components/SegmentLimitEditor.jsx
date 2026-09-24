import React, { useEffect, useRef, useState } from "react";
import { Clock, Trash2 } from "lucide-react";
import { SegmentRowsEditor } from "./SegmentRowsEditor";
import { MIN_SEGMENT_SEC, MAX_SEGMENT_SEC } from "../constants";
import { findNextActiveSegment, segmentDraftsFromSegments } from "../utils/segments";
import { uid } from "../utils/misc";
import { parseDurationToSeconds, secsToHMS } from "../utils/time";

const draftRowsForCard = (card) => card.segments?.length
  ? segmentDraftsFromSegments(card.segments)
  : [{ id: `draft-${uid()}`, value: "" }];

export function SegmentLimitEditor({ card, onSetSegments, onRemoveTimer, palette, onEditingChange }) {
  const containerRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(() => draftRowsForCard(card));
  const [errors, setErrors] = useState({});
  const popoverRef = useRef(null);

  useEffect(() => {
    if (!editing) {
      setRows(draftRowsForCard(card));
      setErrors({});
    }
  }, [card, editing]);

  useEffect(() => {
    if (!editing) return undefined;
    const handler = (event) => {
      if (!containerRef.current || containerRef.current.contains(event.target)) return;
      setEditing(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [editing]);

  useEffect(() => {
    onEditingChange?.(editing);
    return () => onEditingChange?.(false);
  }, [editing, onEditingChange]);

  useEffect(() => {
    if (!editing) return;
    const id = requestAnimationFrame(() => {
      const firstInput = popoverRef.current?.querySelector("input");
      if (firstInput) {
        firstInput.focus();
        firstInput.select?.();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [editing]);

  const segments = card.segments || [];
  const hasTimer = segments.length > 0;
  const totalLimit =
    card.durationSec ?? segments.reduce((sum, seg) => sum + (seg.durationSec ?? 0), 0);
  const totalLimitSec = Math.max(totalLimit ?? 0, 0);
  const activeIdx = card.activeSegmentIndex ?? findNextActiveSegment(segments);
  const currentSegmentTotal =
    segments?.[activeIdx]?.durationSec ?? segments?.[0]?.durationSec ?? totalLimitSec;
  const currentSegmentTotalSec = Math.max(currentSegmentTotal ?? 0, 0);

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
    setRows((prev) => [
      ...prev,
      { id: `draft-${uid()}`, value: prev.length ? prev[prev.length - 1].value : "25" },
    ]);
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
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={hasTimer
            ? "interactive-button rounded px-3 py-1 text-sm tabular-nums md:px-2 md:py-0.5 md:text-xs"
            : "interactive-button rounded-md p-2 transition-colors hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/30 md:p-1"}
          style={hasTimer
            ? { color: palette.subtext, backgroundColor: "transparent", border: `1px dashed ${palette.border}` }
            : { color: palette.subtext }}
          onClick={() => setEditing((v) => !v)}
          title={hasTimer ? "Edit segment durations" : "Add timer"}
          aria-label={hasTimer ? "Edit timer" : "Add timer"}
        >
          {hasTimer
            ? segments.length <= 1
              ? secsToHMS(totalLimitSec)
              : `${secsToHMS(currentSegmentTotalSec)}/${secsToHMS(totalLimitSec)}`
            : <Clock className="h-4 w-4" />}
        </button>
        {hasTimer ? (
          <button
            type="button"
            className="interactive-button rounded-md p-1.5 md:p-1"
            style={{ color: palette.subtext }}
            onClick={() => {
              setEditing(false);
              onRemoveTimer?.();
            }}
            title="Remove timer"
            aria-label="Remove timer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {editing && (
        <div
          ref={popoverRef}
          className="absolute right-0 mt-2 w-64 space-y-3 rounded-xl p-3"
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.altKey
            ) {
              event.preventDefault();
              handleSave();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setEditing(false);
            }
          }}
          style={{
            zIndex: 9999,
            backgroundColor: palette.surface,
            border: `1px solid ${palette.border}`,
            boxShadow: "0 12px 24px rgba(0,0,0,0.25)",
          }}
        >
          <h4 className="text-xs font-semibold" style={{ color: palette.text }}>
            {hasTimer ? "Segments" : "Set timer"}
          </h4>
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
            onSubmit={handleSave}
          />
          <button
            type="button"
            className="interactive-button w-full rounded-md px-2 py-1 text-sm md:text-xs"
            style={{ border: `1px dashed ${palette.border}`, color: palette.subtext }}
            onClick={handleAddRow}
          >
            Add segment
          </button>
          <div className="flex justify-end gap-2 text-sm md:text-xs">
            <button
              type="button"
              className="interactive-button rounded-md px-2 py-1"
              style={{ border: `1px solid ${palette.border}`, color: palette.subtext }}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="interactive-button rounded-md px-2 py-1 font-medium"
              style={{ backgroundColor: palette.text, color: palette.bg }}
              onClick={handleSave}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
