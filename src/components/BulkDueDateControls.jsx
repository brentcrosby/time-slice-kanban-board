import React, { useEffect, useState } from "react";

export function BulkDueDateControls({ selected, onApply, palette }) {
  const first = selected[0];
  const timeOf = (card) => card?.dueDate && card.dueTimeExplicit ? card.dueTime || "" : "";
  const sameDate = selected.every((card) => (card.dueDate || "") === (first?.dueDate || ""));
  const sameTime = selected.every((card) => timeOf(card) === timeOf(first));
  const sharedDate = sameDate ? first?.dueDate || "" : "";
  const sharedTime = sameTime ? timeOf(first) : "";
  const [date, setDate] = useState(sharedDate);
  const [time, setTime] = useState(sharedTime);
  useEffect(() => { setDate(sharedDate); setTime(sharedTime); }, [sharedDate, sharedTime]);
  const style = { borderColor: palette.border, backgroundColor: palette.surface, color: palette.text };
  const inputClass = "min-w-0 rounded-md border px-2 py-1.5 text-base md:text-sm";
  const buttonClass = "header-action-button rounded-md border px-2 py-1.5 text-xs disabled:opacity-40";
  return <form className="flex w-full flex-wrap items-end gap-2 border-t pt-2" style={{ borderColor: palette.border }}
    aria-label="Due dates for selected tasks" onSubmit={(event) => { event.preventDefault(); if (date) onApply(date, time); }}>
    <label className="flex min-w-0 flex-col gap-1 text-xs">Due date
      <input aria-label="Due date for selected tasks" type="date" required value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} style={style} />
    </label>
    <label className="flex min-w-0 flex-col gap-1 text-xs">Due time (optional)
      <input aria-label="Due time for selected tasks" type="time" value={time} disabled={!date} onChange={(event) => setTime(event.target.value)} className={`${inputClass} disabled:opacity-40`} style={style} />
    </label>
    <button type="submit" disabled={!date} className={buttonClass} style={style}>Apply due date</button>
    <button type="button" disabled={!selected.some((card) => card.dueDate)} onClick={() => { onApply(null); setDate(""); setTime(""); }} className={buttonClass} style={style}>Clear due dates</button>
    <p className="w-full text-xs" style={{ color: palette.subtext }}>{!sameDate || !sameTime ? "Selected tasks have different due dates or times. " : ""}Applies to all {selected.length} selected tasks. No time means due by 11:59 PM.</p>
  </form>;
}
