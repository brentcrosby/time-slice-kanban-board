import React, { useRef, useState } from "react";
import { formatWorkTime } from "../utils/workTimeFormat";

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
export const formatTimelineTime = (timestamp) => timeFormat.format(timestamp);
const describe = (label, start, end) => `${label}: ${formatTimelineTime(start)}–${formatTimelineTime(end)} · ${formatWorkTime((end - start) / 1000)}`;

function SessionBar({ start, end, day, color, label, onSelect, track, session, onEdit, overlay = false }) {
  const gesture = useRef(null);
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState(null);
  const span = day.end - day.start;
  const draggable = Boolean(session && onEdit);
  const canResizeStart = draggable && start === session.start;
  const canResizeEnd = draggable && end === session.end;
  const displayedStart = Math.max(day.start, preview?.start ?? start);
  const displayedEnd = Math.min(day.end, preview?.end ?? end);
  const description = describe(label, start, end);

  const position = (event, drag) => {
    const pixels = event.clientX - drag.x;
    if (Math.abs(pixels) >= 3) drag.moved = true;
    if (!drag.moved) return null;
    // Snap the change to minutes, preserving seconds already in the log.
    const clampedPixels = Math.max(drag.left - drag.x, Math.min(drag.left + drag.width - drag.x, pixels));
    const delta = Math.round(clampedPixels / drag.width * span / 60_000) * 60_000;
    const { start, end } = drag.session;
    const now = Date.now();
    const minimum = Math.min(60_000, end - start);
    if (drag.mode === "start") return { start: Math.min(end - minimum, start + delta), end };
    if (drag.mode === "end") return { start, end: Math.max(start + minimum, Math.min(now, end + delta)) };
    const shift = Math.min(now - end, delta);
    return { start: start + shift, end: end + shift };
  };

  const clearGesture = () => { gesture.current = null; setPreview(null); };

  return <button type="button" title={description} aria-label={description} tabIndex={overlay ? -1 : undefined}
    className={`absolute inset-y-1 rounded-sm focus-visible:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 ${draggable ? "cursor-grab select-none active:cursor-grabbing" : ""} ${overlay || preview ? "z-10 ring-2 ring-inset ring-white/70" : ""}`}
    style={{ left: `${(displayedStart - day.start) / span * 100}%`, width: `${Math.max(0, displayedEnd - displayedStart) / span * 100}%`,
      minWidth: 3, backgroundColor: color, touchAction: draggable ? "none" : undefined }}
    onPointerDown={(event) => {
      if (!draggable || event.button !== 0 || event.isPrimary === false || gesture.current) return;
      suppressClick.current = false;
      const rect = track.current.getBoundingClientRect();
      const width = track.current.clientWidth || rect.width;
      if (!width) return;
      gesture.current = { id: event.pointerId, x: event.clientX, left: rect.left + track.current.clientLeft, width,
        session, mode: event.target.dataset.sessionEdge || "move", moved: false };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }}
    onPointerMove={(event) => {
      const drag = gesture.current;
      if (drag && drag.id === event.pointerId) setPreview(position(event, drag));
    }}
    onPointerUp={(event) => {
      const drag = gesture.current;
      if (!drag || drag.id !== event.pointerId) return;
      const result = position(event, drag);
      clearGesture();
      if (!result) return;
      suppressClick.current = true;
      if (result.start !== drag.session.start || result.end !== drag.session.end) onEdit(drag.session, result.start, result.end);
    }}
    onPointerCancel={(event) => { if (gesture.current?.id === event.pointerId) clearGesture(); }}
    onLostPointerCapture={(event) => { if (gesture.current?.id === event.pointerId) clearGesture(); }}
    onClick={(event) => {
      if (suppressClick.current && event.detail > 0) { suppressClick.current = false; return; }
      onSelect(description, start, end);
    }}>
    {canResizeStart && <span aria-hidden="true" data-session-edge="start" className="absolute inset-y-0 left-0 w-1/4 max-w-3.5 cursor-ew-resize rounded-l-sm border-l-2 border-white/80 bg-white/20" />}
    {canResizeEnd && <span aria-hidden="true" data-session-edge="end" className="absolute inset-y-0 right-0 w-1/4 max-w-3.5 cursor-ew-resize rounded-r-sm border-r-2 border-white/80 bg-white/20" />}
    {preview && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center whitespace-nowrap rounded bg-black/80 px-1.5 text-xs text-white">
      {formatTimelineTime(preview.start)}–{formatTimelineTime(preview.end)}
    </span>}
  </button>;
}

export function ArchiveSessionTrack({ intervals, sessions = [], selected, day, color, label, palette, onSelect, onEdit, now = null }) {
  const track = useRef(null);
  const span = day.end - day.start;
  return <div ref={track} className="relative h-9 rounded-md border" style={{ borderColor: palette.border, backgroundColor: palette.surface }}>
    <div className="absolute inset-0 overflow-hidden rounded-md" aria-hidden="true">
      {[0.25, 0.5, 0.75].map((fraction) => <span key={fraction} className="absolute inset-y-0 border-l" style={{ left: `${fraction * 100}%`, borderColor: palette.border }} />)}
      {now != null && now >= day.start && now < day.end && <span className="pointer-events-none absolute inset-y-0 z-10 border-l-2"
        style={{ left: `${(now - day.start) / span * 100}%`, borderColor: palette.text, boxShadow: `0 0 0 1px ${palette.surface}` }} />}
    </div>
    {intervals.map(([start, end], index) => {
      const matches = onEdit ? sessions.filter((session) => session.start < end && (session.end ?? now ?? Infinity) > start) : [];
      const session = matches.length === 1 && matches[0].end != null ? matches[0] : null;
      const picked = !session && selected && matches.find((item) => item.index === selected.index && item.start === selected.start && item.end === selected.end);
      const barProps = { day, color, label, track, onEdit, onSelect };
      return <React.Fragment key={`${start}-${index}`}>
        <SessionBar {...barProps} start={start} end={end} session={session} />
        {picked && <SessionBar {...barProps} start={Math.max(start, picked.start)} end={Math.min(end, picked.end)} session={picked} overlay
          onSelect={() => {}} />}
      </React.Fragment>;
    })}
  </div>;
}
