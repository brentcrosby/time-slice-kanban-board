import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3, Pencil, Plus } from "lucide-react";
import { WorkSessionForm } from "./WorkSessionForm";
import { dailyActivity, dayKey } from "../utils/workActivity";
import { formatWorkTime } from "../utils/workTimeFormat";
const formatDay = (timestamp) => new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(timestamp);
const formatTime = (timestamp) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(timestamp);
const formatEndpoint = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
const BAR_COLORS = ["#2563eb", "#a855f7", "#0d9488", "#d97706"];

function SessionTrack({ intervals, day, color, label, palette, onSelect, now = null }) {
  const span = day.end - day.start;
  return (
    <div className="relative h-9 overflow-hidden rounded-md border" style={{ borderColor: palette.border, backgroundColor: palette.surface }}>
      {[0.25, 0.5, 0.75].map((fraction) => <span key={fraction} aria-hidden="true" className="absolute inset-y-0 border-l" style={{ left: `${fraction * 100}%`, borderColor: palette.border }} />)}
      {now != null && now >= day.start && now < day.end && <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 z-10 border-l-2"
        style={{ left: `${(now - day.start) / span * 100}%`, borderColor: palette.text, boxShadow: `0 0 0 1px ${palette.surface}` }}
      />}
      {intervals.map(([start, end], index) => {
        const description = `${label}: ${formatTime(start)}–${formatTime(end)} · ${formatWorkTime((end - start) / 1000)}`;
        return <button key={`${start}-${index}`} type="button" title={description} aria-label={description}
          className="absolute inset-y-1 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
          style={{ left: `${(start - day.start) / span * 100}%`, width: `${(end - start) / span * 100}%`, minWidth: 3, backgroundColor: color }}
          onClick={() => onSelect(description, start, end)} />;
      })}
    </div>
  );
}

export function DailyActivity({ cards, palette, onLogWork, onEditWork }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(interval);
  }, []);
  const days = dailyActivity(cards, now);
  const [selectedKey, setSelectedKey] = useState(null);
  const [selectedSession, setSelectedSession] = useState("");
  const [loggingWork, setLoggingWork] = useState(false);
  const [sessionPicker, setSessionPicker] = useState(null);
  const [editing, setEditing] = useState(null);
  const selectedIndex = Math.max(0, days.findIndex((day) => day.key === selectedKey));
  const day = days[selectedIndex];
  const chooseDay = (key) => { setSelectedKey(key); setSelectedSession(""); setSessionPicker(null); setEditing(null); };
  const openSessions = (task, start = day.start, end = day.end) => {
    const sessions = task.sessions.filter((session) => session.end != null && session.start < end && session.end > start);
    setSessionPicker({ taskId: task.id, start, end });
    setEditing(sessions.length === 1 ? sessions[0] : null);
    setLoggingWork(false);
  };
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
      {onLogWork && <button type="button" onClick={() => { setLoggingWork(!loggingWork); setSessionPicker(null); setEditing(null); }} aria-expanded={loggingWork}
        className="interactive-button flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: palette.border }}>
        <Plus className="h-4 w-4" />Log past work
      </button>}
      {loggingWork && <WorkSessionForm cards={cards} day={day} palette={palette} onCancel={() => setLoggingWork(false)} onSave={(session) => {
        onLogWork(session);
        chooseDay(dayKey(new Date(session.start)));
        setNow(Date.now());
        setLoggingWork(false);
      }} />}
      <div className="rounded-xl border p-4" style={{ borderColor: palette.border, backgroundColor: palette.card }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: palette.subtext }}><Clock3 className="h-4 w-4" />Time worked{day.tasks.some((task) => task.running) && <span className="ml-auto text-xs">● Running</span>}</div>
        <p className="mt-1 text-3xl font-semibold tabular-nums" data-testid="daily-work-total">{formatWorkTime(day.seconds)}</p>
        <p className="mt-1 text-xs" style={{ color: palette.subtext }}>{day.tasks.length} {day.tasks.length === 1 ? "task" : "tasks"} worked on · Overlaps counted once</p>
      </div>
      {day.tasks.length > 0 ? <div className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold">Your day</h4>
          <p className="mt-1 text-xs" style={{ color: palette.subtext }}>{onEditWork ? "Tap a task bar to see or edit its recorded times." : "Tap a session to see its times."} All times are local.</p>
        </div>
        {day.key === dayKey(new Date(now)) && <div className="text-right text-xs tabular-nums" style={{ color: palette.subtext }}>
          Now · <time dateTime={new Date(now).toISOString()}>{formatTime(now)}</time>
        </div>}
        <div className="flex justify-between text-xs tabular-nums" style={{ color: palette.subtext }}>
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => <span key={fraction}>{formatTime(day.start + (day.end - day.start) * fraction)}</span>)}
        </div>
        <SessionTrack intervals={day.intervals} day={day} color={palette.subtext} label="Total work" palette={palette} onSelect={(description) => { setSelectedSession(description); setSessionPicker(null); setEditing(null); }} now={day.key === dayKey(new Date(now)) ? now : null} />
        {day.tasks.map((task, index) => {
          const open = sessionPicker?.taskId === task.id;
          const sessions = open ? task.sessions.filter((session) => session.start < sessionPicker.end && (session.end ?? now) > sessionPicker.start).sort((a, b) => a.start - b.start) : [];
          return <article key={task.id} className="space-y-1.5" aria-label={`${task.title}, ${formatWorkTime(task.seconds)} worked`}>
            <div className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0"><h5 className="break-words font-medium">{task.title}</h5>
                <p className="text-xs" style={{ color: palette.subtext }}>{task.running ? "Running" : task.deleted ? "Deleted task" : task.completed ? "Completed" : "In progress"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="tabular-nums" style={{ color: palette.subtext }}>{formatWorkTime(task.seconds)}</span>
                {onEditWork && <button type="button" title="Edit sessions" aria-label={`Edit sessions for ${task.title}`} aria-expanded={open}
                  className="interactive-button rounded-md border p-2" style={{ borderColor: palette.border }} onClick={() => {
                    setSelectedSession("");
                    if (open) { setSessionPicker(null); setEditing(null); } else openSessions(task);
                  }}><Pencil className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
            <SessionTrack intervals={task.intervals} day={day} color={BAR_COLORS[index % BAR_COLORS.length]} label={task.title} palette={palette} onSelect={(description, start, end) => {
              setSelectedSession(description);
              if (onEditWork) openSessions(task, start, end);
            }} now={day.key === dayKey(new Date(now)) ? now : null} />
            {open && <div className="space-y-2 pt-1">
              {(!editing || sessions.length > 1) && sessions.map((session) => {
                const range = `${formatEndpoint.format(session.start)} – ${session.end == null ? "Running" : formatEndpoint.format(session.end)}`;
                return session.end == null ? <p key={session.index} className="text-xs" style={{ color: palette.subtext }}>{range}. Pause the stopwatch to edit this session.</p> :
                  <button key={session.index} type="button" aria-pressed={editing?.index === session.index}
                    className="interactive-button block w-full rounded-lg border px-3 py-2 text-left text-sm" style={{ borderColor: palette.border, backgroundColor: editing?.index === session.index ? palette.badge : palette.surface }}
                    onClick={() => setEditing(session)}>{session.subtaskTitle || "Main stopwatch"} · {range}</button>;
              })}
              {editing && <WorkSessionForm key={`${editing.index}:${editing.start}:${editing.end}`} day={day} session={editing} palette={palette}
                onCancel={() => { setEditing(null); setSessionPicker(null); }} onSave={({ start, end }) => {
                  onEditWork(task.id, editing, start, end);
                  chooseDay(start < day.end && end > day.start ? day.key : dayKey(new Date(start)));
                  setNow(Date.now());
                  setSelectedSession("Session times saved.");
                }} />}
            </div>}
          </article>;
        })}
        <p role="status" className="min-h-5 text-xs" style={{ color: palette.subtext }}>{selectedSession}</p>
      </div> : <p className="py-4 text-center text-sm" style={{ color: palette.subtext }}>Start a stopwatch or log past work to record your day.</p>}
      <details className="border-t pt-3 text-xs leading-relaxed" style={{ borderColor: palette.border, color: palette.subtext }}>
        <summary className="cursor-pointer">How time is counted</summary>
        <p className="mt-2">Log past work to enter exact start and end times. Earlier stopwatch totals have no session history. Reducing elapsed time trims the latest session’s end. Adding time extends the latest session’s start backward; without a previous session, it ends now. Resetting or removing a stopwatch keeps recorded activity.</p>
      </details>
    </section>
  );
}
