// Session intervals are stored on their task, so account sync carries the
// history with it. Open intervals use timestamps, not a background JS timer.
const clocks = (card) => new Map([
  ["main", card?.stopwatch],
  ...(card?.subtasks || []).map((subtask) => [`sub:${subtask.id}`, subtask.stopwatch]),
]);
const elapsed = (clock, now) => Math.max(0, (clock?.elapsedSec || 0)
  + (clock?.running && clock.lastStartTs != null ? Math.max(0, now - clock.lastStartTs) / 1000 : 0));

export function trackCardWork(before, after, now = Date.now()) {
  if (!after || after.isDraft) return after;
  const active = [...clocks(after)].filter(([, clock]) => clock?.running).map(([id]) => id);
  const log = after.workLog || before?.workLog;
  if (!log && !active.length) return after;
  let changed = !log;
  const sessions = (log?.sessions || []).map((session) => {
    if (session.end == null && !active.includes(session.clock)) {
      changed = true;
      return { ...session, end: Math.max(session.start, now) };
    }
    return session;
  });
  for (const clock of active) {
    if (!sessions.some((session) => session.clock === clock && session.end == null)) {
      sessions.push({ clock, start: now, end: null });
      changed = true;
    }
  }
  if (!changed && after.workLog === log) return after;
  return { ...after, workLog: { since: log?.since ?? now, sessions } };
}

// Main edits affect the task total (including transferred subtask time).
// Subtask edits affect only that subtask. Extend the latest session backward
// for additions; trim newest session ends first for deductions.
export function correctWorkTime(before, after, now = Date.now(), clockId = null) {
  const total = (card) => [...clocks(card)].reduce((sum, [id, clock]) =>
    sum + (clockId == null || id === clockId ? elapsed(clock, now) : 0), 0);
  const difference = (total(after) - total(before)) * 1000;
  if (!Number.isFinite(difference) || difference === 0) return after;
  const log = before.workLog || { since: now, sessions: [] };
  if (difference > 0) {
    const sessions = log.sessions.map((session) => ({ ...session }));
    const latest = sessions.map((session, index) => ({ session, index }))
      .filter(({ session }) => clockId == null || session.clock === clockId)
      .sort((a, b) => (b.session.end ?? now) - (a.session.end ?? now) || b.index - a.index)[0]?.session;
    if (latest) latest.start -= difference;
    else sessions.push({ clock: clockId ?? "main", start: now - difference, end: now });
    return trackCardWork(null, { ...after, workLog: {
      ...log, since: Math.min(log.since, ...sessions.map((session) => session.start)), sessions,
    } }, now);
  }
  if (!before.workLog) return after;
  let deduction = -difference;
  const sessions = log.sessions.map((session) => ({ ...session, end: session.end ?? now }));
  const latestFirst = sessions.map((session, index) => ({ session, index }))
    .sort((a, b) => b.session.end - a.session.end || b.index - a.index);
  for (const { session } of latestFirst) {
    if (clockId != null && session.clock !== clockId) continue;
    const removed = Math.min(deduction, Math.max(0, session.end - session.start));
    session.end -= removed;
    deduction -= removed;
  }
  return trackCardWork(null, {
    ...after,
    workLog: { ...before.workLog, sessions: sessions.filter((session) => session.end > session.start) },
  }, now);
}

export function trackBoardWork(previous, nextCards, now = Date.now()) {
  const previousCards = new Map(Object.values(previous.cardsByCol).flat().map((card) => [card.id, card]));
  const currentIds = new Set(Object.values(nextCards).flat().map((card) => card.id));
  const cardsByCol = Object.fromEntries(Object.entries(nextCards).map(([column, cards]) =>
    [column, cards.map((card) => trackCardWork(previousCards.get(card.id), card, now))]));
  const archivedCards = previous.archivedCards.filter((card) => !card.activityOnly || !currentIds.has(card.id));
  const archivedIds = new Set(archivedCards.map((card) => card.id));
  for (const card of previousCards.values()) {
    if (currentIds.has(card.id) || archivedIds.has(card.id) || !card.workLog?.sessions.length) continue;
    const stopped = trackCardWork(card, { ...card, stopwatch: null, subtasks: [] }, now);
    // Keep a small history record when a task is deleted or its column cleared.
    archivedCards.push({ id: card.id, title: card.title, group: card.group || null,
      activityOnly: true, deletedAt: now, workLog: stopped.workLog });
  }
  return { cardsByCol, archivedCards };
}

// Undo changes the board, but time already worked remains a historical fact.
export function restoreWorkBoard(previous, snapshot, now = Date.now()) {
  const current = new Map([...previous.archivedCards, ...Object.values(previous.cardsByCol).flat()]
    .map((card) => [card.id, card]));
  const restoreLog = (card) => {
    const latest = current.get(card.id);
    return trackCardWork(latest, latest?.workLog ? { ...card, workLog: latest.workLog } : card, now);
  };
  const cardsByCol = Object.fromEntries(Object.entries(snapshot.cardsByCol)
    .map(([column, cards]) => [column, cards.map(restoreLog)]));
  const archivedCards = (snapshot.archivedCards || []).map(restoreLog);
  const retainedIds = new Set([...Object.values(cardsByCol).flat(), ...archivedCards].map((card) => card.id));
  for (const card of current.values()) {
    if (retainedIds.has(card.id) || !card.workLog?.sessions.length) continue;
    const stopped = trackCardWork(card, { ...card, stopwatch: null, subtasks: [] }, now);
    archivedCards.push({ id: card.id, title: card.title, group: card.group || null,
      activityOnly: true, deletedAt: now, workLog: stopped.workLog });
  }
  return { cardsByCol, archivedCards };
}

export const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function unionIntervals(intervals) {
  const sorted = intervals.filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .map((interval) => [...interval]).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
    else merged.push(interval);
  }
  return merged;
}

const secondsIn = (intervals) => intervals.reduce((total, [start, end]) => total + (end - start) / 1000, 0);

export function dailyActivity(cards, now = Date.now()) {
  const days = new Map();
  const ensureDay = (timestamp) => {
    const date = new Date(timestamp);
    const key = dayKey(date);
    if (!days.has(key)) {
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
      days.set(key, { key, start, end, tasks: new Map(), intervals: [] });
    }
    return days.get(key);
  };
  ensureDay(now);
  const seen = new Set();
  for (const card of cards) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    for (const session of card.workLog?.sessions || []) {
      let start = session.start;
      const end = Math.min(session.end ?? now, now);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) continue;
      while (start < end) {
        const day = ensureDay(start);
        const slice = [start, Math.min(end, day.end)];
        if (!day.tasks.has(card.id)) day.tasks.set(card.id, { id: card.id, title: card.title, group: card.group,
          completed: Boolean(card.completedAt), deleted: Boolean(card.activityOnly), running: false, intervals: [] });
        const task = day.tasks.get(card.id);
        task.intervals.push(slice);
        task.running ||= session.end == null && day.key === dayKey(new Date(now));
        day.intervals.push(slice);
        start = slice[1];
      }
    }
  }
  return [...days.values()].sort((a, b) => b.key.localeCompare(a.key)).map((day) => ({
    ...day,
    intervals: unionIntervals(day.intervals),
    seconds: secondsIn(unionIntervals(day.intervals)),
    tasks: [...day.tasks.values()].map((task) => ({ ...task, intervals: unionIntervals(task.intervals), seconds: secondsIn(unionIntervals(task.intervals)) }))
      .sort((a, b) => a.intervals[0][0] - b.intervals[0][0]),
  }));
}
