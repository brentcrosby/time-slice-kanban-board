import React, { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { SegmentRowsEditor } from "./SegmentRowsEditor";
import { MIN_SEGMENT_SEC, MAX_SEGMENT_SEC } from "../constants";
import { clamp, uid } from "../utils/misc";
import { parseDurationToSeconds } from "../utils/time";
import {
  findNextActiveSegment,
  formatSegmentForInput,
  segmentDraftsFromSegments,
} from "../utils/segments";
import { TITLE_PLACEHOLDERS } from "../constants/titlePlaceholders";
import { useRotatingPlaceholder } from "../hooks/useRotatingPlaceholder";

export function EditCardModal({ card, onClose, onSave, palette }) {
  const [title, setTitle] = useState(card.title);
  const [notes, setNotes] = useState(card.notes || "");
  const [limitInput, setLimitInput] = useState(formatSegmentForInput(card.durationSec || MIN_SEGMENT_SEC));
  const [useSegments, setUseSegments] = useState((card.segments?.length || 0) > 1);
  const [segmentRows, setSegmentRows] = useState(() => segmentDraftsFromSegments(card.segments));
  const [segmentErrors, setSegmentErrors] = useState({});
  const [limitError, setLimitError] = useState("");
  const showTitlePlaceholder = title.length === 0;
  const {
    placeholder: titlePlaceholder,
    visible: titlePlaceholderVisible,
  } = useRotatingPlaceholder(TITLE_PLACEHOLDERS, showTitlePlaceholder);

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
    setSegmentRows((prev) => [
      ...prev,
      { id: `draft-${uid()}`, value: prev.length ? prev[prev.length - 1].value : formatSegmentForInput(MIN_SEGMENT_SEC) },
    ]);
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
          <label className="block text-xs font-medium" style={{ color: palette.subtext }}>
            Title
          </label>
          <div className="relative mt-1">
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              placeholder=""
              style={{ backgroundColor: "transparent", border: `1px solid ${palette.border}`, color: palette.text }}
            />
            {showTitlePlaceholder ? (
              <span
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 transform text-sm transition-opacity duration-300 ease-in-out"
                aria-hidden="true"
                style={{ color: palette.subtext, opacity: titlePlaceholderVisible ? 0.6 : 0 }}
              >
                {titlePlaceholder}
              </span>
            ) : null}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium" style={{ color: palette.subtext }}>
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                submit();
              }
            }}
            rows={3}
            className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: "transparent", border: `1px solid ${palette.border}`, color: palette.text }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium" style={{ color: palette.subtext }}>
            Timing
          </label>
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
                onChange={(event) => setLimitInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                className="mt-2 w-full rounded-xl px-3 py-2 text-sm outline-none"
                placeholder="25 or 1:00"
                style={{ backgroundColor: "transparent", border: `1px solid ${palette.border}`, color: palette.text }}
              />
              {limitError ? (
                <p className="mt-1 text-[11px]" style={{ color: palette.dangerText }}>
                  {limitError}
                </p>
              ) : null}
            </>
          ) : (
            <div className="mt-2 space-y-2">
              <SegmentRowsEditor
                rows={segmentRows}
                errors={segmentErrors}
                onChange={handleSegmentChange}
                onRemove={segmentRows.length > 1 ? handleRemoveSegment : null}
                palette={palette}
                showIndex
              />
              <button
                type="button"
                className="interactive-button w-full rounded-md px-2 py-1 text-xs"
                style={{ border: `1px dashed ${palette.border}`, color: palette.subtext }}
                onClick={handleAddSegment}
              >
                Add segment
              </button>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="interactive-button rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${palette.border}` }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="interactive-button rounded-xl px-3 py-2 text-sm font-medium"
            style={{ backgroundColor: palette.text, color: palette.bg }}
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
