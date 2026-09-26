export const TASK_COLUMNS = ["todo", "doing", "done"];

// Freeze elapsed time before completing, archiving, or copying a running task.
export function pauseTask(card, now = Date.now()) {
  const next = { ...card, running: false, lastStartTs: null };
  if (card.running && card.lastStartTs != null && card.segments?.length) {
    const active = card.activeSegmentIndex ?? 0;
    next.segments = card.segments.map((segment, index) => index === active ? {
      ...segment,
      remainingSec: Math.max(0, (card.remainingSecAtStart ?? segment.remainingSec) - Math.max(0, now - card.lastStartTs) / 1000),
    } : { ...segment });
    next.remainingSec = next.segments.reduce((sum, segment) => sum + segment.remainingSec, 0);
    next.remainingSecAtStart = next.segments[active]?.remainingSec ?? 0;
  }
  if (card.stopwatch) {
    next.stopwatch = {
      ...card.stopwatch,
      elapsedSec: (card.stopwatch.elapsedSec || 0) + (card.stopwatch.running && card.stopwatch.lastStartTs != null ? Math.max(0, now - card.stopwatch.lastStartTs) / 1000 : 0),
      running: false,
      lastStartTs: null,
    };
  }
  return next;
}

export function taskInColumn(card, fromColumn, toColumn, now = Date.now()) {
  if (fromColumn === toColumn) return card;
  return toColumn === "done"
    ? { ...pauseTask(card, now), completedAt: now, archivedAt: null }
    : { ...card, completedAt: null, archivedAt: null };
}

export function moveTasks(board, ids, destination, index = null, now = Date.now()) {
  if (!TASK_COLUMNS.includes(destination)) return board;
  const selected = new Set(ids);
  const moving = TASK_COLUMNS.flatMap((column) => (board[column] || [])
    .filter((card) => selected.has(card.id))
    .map((card) => taskInColumn(card, column, destination, now)));
  if (!moving.length) return board;
  const next = Object.fromEntries(TASK_COLUMNS.map((column) => [column, (board[column] || []).filter((card) => !selected.has(card.id))]));
  const original = board[destination] || [];
  const insertion = index == null ? original.length : Math.max(0, Math.min(index, original.length));
  const removedBefore = original.slice(0, insertion).filter((card) => selected.has(card.id)).length;
  next[destination].splice(insertion - removedBefore, 0, ...moving);
  return next;
}

export function copyTask(card, destination, newId, now = Date.now()) {
  const copy = JSON.parse(JSON.stringify(pauseTask(card, now)));
  return {
    ...copy, id: newId, createdAt: now, isDraft: false,
    completedAt: destination === "done" ? now : null, archivedAt: null,
    subtasks: (copy.subtasks || []).map((item, index) => ({ ...item, id: `${newId}-sub-${index}` })),
    segments: (copy.segments || []).map((item, index) => ({ ...item, id: `${newId}-seg-${index}` })),
  };
}

export function selectionRange(orderedIds, anchor, target) {
  const start = orderedIds.indexOf(anchor);
  const end = orderedIds.indexOf(target);
  return start < 0 || end < 0 ? [target] : orderedIds.slice(Math.min(start, end), Math.max(start, end) + 1);
}
