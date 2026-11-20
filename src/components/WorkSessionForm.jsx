import React, { useState } from "react";
import { localDateTimeValue, validateWorkSession } from "../utils/manualWork";
import { formatWorkTime } from "../utils/workTimeFormat";

export function WorkSessionForm({ cards, day, onSave, onCancel, palette, session = null }) {
  const initialEnd = Math.floor(Math.min(Date.now(), day.end - 60_000) / 60_000) * 60_000;
  const [taskId, setTaskId] = useState("");
  const [title, setTitle] = useState("");
  const originalStart = session ? localDateTimeValue(session.start, true) : "";
  const originalEnd = session ? localDateTimeValue(session.end, true) : "";
  const [startValue, setStartValue] = useState(() => originalStart || localDateTimeValue(initialEnd - 30 * 60_000));
  const [endValue, setEndValue] = useState(() => originalEnd || localDateTimeValue(initialEnd));
  const [error, setError] = useState("");
  // Keep untouched endpoints exact, including their milliseconds and UTC offset.
  const start = session && startValue === originalStart ? session.start : new Date(startValue).getTime();
  const end = session && endValue === originalEnd ? session.end : new Date(endValue).getTime();
  const style = { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text };
  const inputClass = "mt-1 w-full min-w-0 rounded-lg border px-3 py-2 text-base md:text-sm";
  const submit = (event) => {
    event.preventDefault();
    try {
      validateWorkSession(start, end);
      if (!session && !taskId && !title.trim()) throw new Error("Enter a task title.");
      onSave({ taskId, title: title.trim(), start, end });
    } catch (saveError) { setError(saveError.message); }
  };
  const formTitle = session ? "Edit session times" : "Log past work";
  return <form onSubmit={submit} className="space-y-3 rounded-xl border p-3" style={{ borderColor: palette.border }} aria-label={formTitle}>
    <h4 className="text-sm font-semibold">{formTitle}{session?.subtaskTitle ? ` · ${session.subtaskTitle}` : ""}</h4>
    {!session && <label className="block text-sm">Task
      <select className={inputClass} style={style} value={taskId} onChange={(event) => setTaskId(event.target.value)}>
        <option value="">New completed task (archive)</option>
        {cards.filter((card) => !card.isDraft && !card.activityOnly && card.title?.trim()).map((card) =>
          <option key={card.id} value={card.id}>{card.title}{card.completedAt ? " · Completed" : " · In progress"}</option>)}
      </select>
    </label>}
    {!session && !taskId && <label className="block text-sm">Task title
      <input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} style={style} placeholder="Morning run" />
    </label>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="block min-w-0 text-sm">Started
        <input required type="datetime-local" step={session ? 1 : 60} value={startValue} onChange={(event) => setStartValue(event.target.value)} className={inputClass} style={style} />
      </label>
      <label className="block min-w-0 text-sm">Ended
        <input required type="datetime-local" step={session ? 1 : 60} value={endValue} onChange={(event) => setEndValue(event.target.value)} className={inputClass} style={style} />
      </label>
    </div>
    <p className="text-xs" style={{ color: palette.subtext }}>All times are local. {end > start && Number.isFinite(end - start) ? (session ? `Session length: ${formatWorkTime((end - start) / 1000)}.` : `${formatWorkTime((end - start) / 1000)} will be added to the task’s stopwatch.`) : "Choose when you worked."} Overlaps count once in the daily total.</p>
    {error && <p role="alert" className="text-sm" style={{ color: palette.dangerText }}>{error}</p>}
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="interactive-button rounded-lg border px-3 py-2 text-sm" style={style}>Cancel</button>
      <button type="submit" className="interactive-button rounded-lg px-3 py-2 text-sm font-medium" style={{ backgroundColor: palette.text, color: palette.bg }}>{session ? "Save times" : "Save work"}</button>
    </div>
  </form>;
}
