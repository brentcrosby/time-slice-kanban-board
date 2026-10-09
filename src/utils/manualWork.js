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

export function localDateTimeValue(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
