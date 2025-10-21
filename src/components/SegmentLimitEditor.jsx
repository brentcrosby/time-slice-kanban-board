import React, { useEffect, useRef, useState } from "react";
import { SegmentRowsEditor } from "./SegmentRowsEditor";
import { MIN_SEGMENT_SEC, MAX_SEGMENT_SEC } from "../constants";
import { findNextActiveSegment, segmentDraftsFromSegments } from "../utils/segments";
import { uid } from "../utils/misc";
import { parseDurationToSeconds, secsToHHMM } from "../utils/time";

export function SegmentLimitEditor({ card, onSetSegments, palette }) {
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
    if (!editing) return undefined;
    const handler = (event) => {
      if (!containerRef.current || containerRef.current.contains(event.target)) return;
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
          <h4 className="text-xs font-semibold" style={{ color: palette.text }}>
            Segments
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
            <button
              type="button"
              className="rounded-md px-2 py-1"
              style={{ border: `1px solid ${palette.border}`, color: palette.subtext }}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-md px-2 py-1 font-medium"
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
