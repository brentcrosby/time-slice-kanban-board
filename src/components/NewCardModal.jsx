import React, { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { SegmentRowsEditor } from "./SegmentRowsEditor";
import { MIN_SEGMENT_SEC, MAX_SEGMENT_SEC } from "../constants";
import { clamp, uid } from "../utils/misc";
import { parseDurationToSeconds, parseTimeFromTitle } from "../utils/time";
import { segmentDraftsFromSegments } from "../utils/segments";
import { TITLE_PLACEHOLDERS } from "../constants/titlePlaceholders";
import { useRotatingPlaceholder } from "../hooks/useRotatingPlaceholder";

export function NewCardModal({ defaultCol, onClose, onCreate, columns, palette }) {
  const [colId, setColId] = useState(defaultCol);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [limitInput, setLimitInput] = useState("25");
  const [useSegments, setUseSegments] = useState(false);
  const [segmentRows, setSegmentRows] = useState(() => segmentDraftsFromSegments([]));
  const [segmentErrors, setSegmentErrors] = useState({});
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
      { id: `draft-${uid()}`, value: prev.length ? prev[prev.length - 1].value : "25" },
    ]);
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium" style={{ color: palette.subtext }}>
              Column
            </label>
            <select
              value={colId}
              onChange={(event) => setColId(event.target.value)}
              className="mt-1 w-full rounded-xl px-3 py-2 text-sm"
              style={{ backgroundColor: "transparent", border: `1px solid ${palette.border}`, color: palette.text }}
            >
              {columns.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.name}
                </option>
              ))}
            </select>
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
          <button
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${palette.border}` }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="rounded-xl px-3 py-2 text-sm font-medium"
            style={{ backgroundColor: palette.text, color: palette.bg }}
          >
            Create
          </button>
        </div>
      </div>
    </Modal>
  );
}
