import React, { useState } from "react";
import { Timer, Play, Pause, RotateCcw } from "lucide-react";
import { parseDurationToSeconds, secsToHMS } from "../utils/time";

export function StopwatchControls({ running, elapsed, onStart, onPause, onReset, onRemove, onEdit, color, palette, onEditingChange, label = "", compact = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(false);
  const finish = () => { setEditing(false); onEditingChange(false); };
  const save = () => {
    const seconds = parseDurationToSeconds(draft);
    if (seconds == null || !Number.isFinite(seconds) || seconds < 0) { setError(true); return; }
    onEdit(Math.floor(seconds));
    finish();
  };
  const buttonClass = `interactive-button rounded-md hover:bg-black/10 ${compact ? "p-1" : "p-2 md:p-1"}`;
  const actionLabel = (action) => label ? `${action} ${label} stopwatch` : `${action} stopwatch`;
  return <div data-card-controls className="flex shrink-0 items-center gap-1" style={{ color }}>
    <button type="button" className={buttonClass} style={{ backgroundColor: palette.badge }} title={actionLabel("Remove")} aria-label={actionLabel("Remove")} onClick={onRemove}><Timer size={16} /></button>
    {editing ? <input
      autoFocus onFocus={(event) => event.target.select()} aria-label={label ? `Edit ${label} elapsed time` : "Edit elapsed time"} aria-invalid={error}
      title={error ? "Enter time like 1:25 or 1:02:03" : "Elapsed time (minutes:seconds)"}
      value={draft} onChange={(event) => { setDraft(event.target.value); setError(false); }}
      onBlur={() => { if (parseDurationToSeconds(draft) != null) save(); else finish(); }}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); save(); }
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(); }
      }}
      className={`${compact ? "w-16" : "w-20"} rounded-md border px-2 py-1 text-sm tabular-nums`} style={{ backgroundColor: palette.surface, borderColor: error ? palette.dangerText : palette.border, color }}
    /> : <button type="button" title={label ? `${label} elapsed time` : "Edit elapsed time"} aria-label={`${label ? `${label} elapsed time` : "Edit elapsed time"}, ${secsToHMS(Math.floor(elapsed))}`} onClick={() => { setDraft(secsToHMS(Math.floor(elapsed))); setError(false); setEditing(true); onEditingChange(true); }} className={`interactive-button rounded-md py-1 text-sm font-medium tabular-nums ${compact ? "px-1" : "px-2"}`} style={{ backgroundColor: palette.badge }}>
      {secsToHMS(Math.floor(elapsed))}
    </button>}
    <button type="button" className={buttonClass} title={actionLabel(running ? "Pause" : "Resume")} aria-label={actionLabel(running ? "Pause" : "Resume")} onClick={running ? onPause : onStart}>{running ? <Pause size={16} /> : <Play size={16} />}</button>
    <button type="button" className={buttonClass} title={actionLabel("Reset")} aria-label={actionLabel("Reset")} onClick={onReset}><RotateCcw size={16} /></button>
  </div>;
}
