export function validateWorkSession(start, end, now = Date.now()) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error("Enter a start and end time.");
  if (end <= start) throw new Error("End time must be after start time.");
  if (end > now) throw new Error("Past work must end at or before the current time.");
}

// Add an explicit closed interval without moving or stopping any live clocks.
export function addWorkSession(card, start, end, now = Date.now()) {
  validateWorkSession(start, end, now);
  const stopwatch = card.stopwatch || { elapsedSec: 0, running: false, lastStartTs: null };
  return {
    ...card,
    stopwatch: { ...stopwatch, elapsedSec: (stopwatch.elapsedSec || 0) + (end - start) / 1000 },
    workLog: {
      ...card.workLog,
      since: Math.min(card.workLog?.since ?? start, start),
      sessions: [...(card.workLog?.sessions || []), { clock: "main", start, end }],
    },
  };
}

export function createLoggedTask(id, title, start, end, now = Date.now()) {
  if (!title.trim()) throw new Error("Enter a task title.");
  return addWorkSession({ id, title: title.trim(), subtasks: [], segments: [],
    durationSec: 0, running: false, lastStartTs: null,
    createdAt: now, completedAt: end, archivedAt: now }, start, end, now);
}

export function matchesWorkSession(session, reference) {
  return session != null && session.clock === reference.clock && session.start === reference.start && session.end === reference.end;
}

export function editWorkSession(card, reference, start, end, now = Date.now()) {
  const log = card.workLog;
  const session = log?.sessions?.[reference.index];
  if (!matchesWorkSession(session, reference) || session.end == null) return card;
  validateWorkSession(start, end, now);
  if (start === session.start && end === session.end) return card;
  const difference = (end - start - (session.end - session.start)) / 1000;
  const adjustClock = (clock) => ({ ...clock, elapsedSec: Math.max(0, (clock.elapsedSec || 0) + difference) });
  const next = {
    ...card,
    workLog: {
      ...log,
      since: Math.min(log.since ?? start, start),
      sessions: log.sessions.map((item, index) => index === reference.index ? { ...item, start, end } : item),
    },
  };
  if (session.clock === "main" && card.stopwatch && difference) next.stopwatch = adjustClock(card.stopwatch);
  if (session.clock?.startsWith("sub:") && difference && card.subtasks?.length) {
    next.subtasks = card.subtasks.map((task) => task.id === session.clock.slice(4) && task.stopwatch
      ? { ...task, stopwatch: adjustClock(task.stopwatch) } : task);
  }
  return next;
}

export function localDateTimeValue(timestamp, withSeconds = false) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}${withSeconds && date.getSeconds() ? `:${pad(date.getSeconds())}` : ""}`;
}
