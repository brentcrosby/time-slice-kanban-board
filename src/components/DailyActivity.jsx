import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { dailyActivity } from "../utils/workActivity";

export const formatWorkTime = (seconds) => {
  const total = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours ? `${hours}h ` : ""}${minutes}m${!hours && !minutes ? ` ${total % 60}s` : ""}`;
};
const formatDay = (timestamp) => new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(timestamp);
const formatTime = (timestamp) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(timestamp);
const BAR_COLORS = ["#2563eb", "#a855f7", "#0d9488", "#d97706"];

function SessionTrack({ intervals, day, color, label, palette, onSelect }) {
  const span = day.end - day.start;
  return (
    <div className="relative h-9 overflow-hidden rounded-md border" style={{ borderColor: palette.border, backgroundColor: palette.surface }}>
      {[0.25, 0.5, 0.75].map((fraction) => <span key={fraction} aria-hidden="true" className="absolute inset-y-0 border-l" style={{ left: `${fraction * 100}%`, borderColor: palette.border }} />)}
      {intervals.map(([start, end], index) => {
        const description = `${label}: ${formatTime(start)}–${formatTime(end)} · ${formatWorkTime((end - start) / 1000)}`;
        return <button key={`${start}-${index}`} type="button" title={description} aria-label={description}
          className="absolute inset-y-1 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
          style={{ left: `${(start - day.start) / span * 100}%`, width: `${(end - start) / span * 100}%`, minWidth: 3, backgroundColor: color }}
          onClick={() => onSelect(description)} />;
      })}
    </div>
  );
}

export function DailyActivity({ cards, palette }) {
  const days = dailyActivity(cards);
  const [selectedKey, setSelectedKey] = useState(null);
  const [selectedSession, setSelectedSession] = useState("");
  const selectedIndex = Math.max(0, days.findIndex((day) => day.key === selectedKey));
  const day = days[selectedIndex];
  const chooseDay = (key) => { setSelectedKey(key); setSelectedSession(""); };
  return (
    <section aria-label="Daily activity" className="space-y-4" style={{ color: palette.text }}>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Previous day with activity" disabled={selectedIndex === days.length - 1}
          onClick={() => chooseDay(days[selectedIndex + 1].key)} className="interactive-button rounded-lg border p-2 disabled:opacity-30" style={{ borderColor: palette.border }}><ChevronLeft className="h-4 w-4" /></button>
        <select aria-label="Activity day" value={day.key} onChange={(event) => chooseDay(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border p-2 text-sm" style={{ backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }}>
          {days.map((item, index) => <option key={item.key} value={item.key}>{index === 0 ? "Today · " : ""}{formatDay(item.start)}</option>)}
        </select>
        <button type="button" aria-label="Next day with activity" disabled={selectedIndex === 0}
          onClick={() => chooseDay(days[selectedIndex - 1].key)} className="interactive-button rounded-lg border p-2 disabled:opacity-30" style={{ borderColor: palette.border }}><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="rounded-xl border p-4" style={{ borderColor: palette.border, backgroundColor: palette.card }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: palette.subtext }}><Clock3 className="h-4 w-4" />Time worked{day.tasks.some((task) => task.running) && <span className="ml-auto text-xs">● Running</span>}</div>
        <p className="mt-1 text-3xl font-semibold tabular-nums" data-testid="daily-work-total">{formatWorkTime(day.seconds)}</p>
        <p className="mt-1 text-xs" style={{ color: palette.subtext }}>{day.tasks.length} {day.tasks.length === 1 ? "task" : "tasks"} worked on · Overlaps counted once</p>
      </div>
      {day.tasks.length > 0 ? <div className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold">Your day</h4>
          <p className="mt-1 text-xs" style={{ color: palette.subtext }}>Tap a session to see its times. All times are local.</p>
        </div>
        <div className="flex justify-between text-xs tabular-nums" style={{ color: palette.subtext }}>
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => <span key={fraction}>{formatTime(day.start + (day.end - day.start) * fraction)}</span>)}
        </div>
        <SessionTrack intervals={day.intervals} day={day} color={palette.subtext} label="Total work" palette={palette} onSelect={setSelectedSession} />
        {day.tasks.map((task, index) => <article key={task.id} className="space-y-1.5" aria-label={`${task.title}, ${formatWorkTime(task.seconds)} worked`}>
          <div className="flex items-start justify-between gap-3 text-sm">
            <div className="min-w-0"><h5 className="break-words font-medium">{task.title}</h5>
              <p className="text-xs" style={{ color: palette.subtext }}>{task.running ? "Running" : task.deleted ? "Deleted task" : task.completed ? "Completed" : "In progress"}</p>
            </div>
            <span className="shrink-0 tabular-nums" style={{ color: palette.subtext }}>{formatWorkTime(task.seconds)}</span>
          </div>
          <SessionTrack intervals={task.intervals} day={day} color={BAR_COLORS[index % BAR_COLORS.length]} label={task.title} palette={palette} onSelect={setSelectedSession} />
        </article>)}
        <p role="status" className="min-h-5 text-xs" style={{ color: palette.subtext }}>{selectedSession}</p>
      </div> : <p className="py-4 text-center text-sm" style={{ color: palette.subtext }}>Start any task or subtask stopwatch to record your day.</p>}
      <details className="border-t pt-3 text-xs leading-relaxed" style={{ borderColor: palette.border, color: palette.subtext }}>
        <summary className="cursor-pointer">How time is counted</summary>
        <p className="mt-2">Activity starts with this update; earlier stopwatch totals have no session history. Reducing elapsed time trims the latest session’s end. Adding time extends the latest session’s start backward; without a previous session, it ends now. Resetting or removing a stopwatch keeps recorded activity.</p>
      </details>
    </section>
  );
}
