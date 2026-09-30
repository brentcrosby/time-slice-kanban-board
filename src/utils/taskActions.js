import { linkParentStopwatch, pauseSubtaskStopwatches } from "./subtaskStopwatch";

export const TASK_COLUMNS = ["todo", "doing", "done"];

// Move only tasks that just changed from unflagged to flagged. This leaves
// existing flagged tasks and manual ordering alone until they are flagged anew.
export function promoteNewlyFlagged(previous, next) {
  if (next === previous) return next;
  const wasFlagged = new Map(TASK_COLUMNS.flatMap((column) =>
    (previous[column] || []).map((card) => [card.id, Boolean(card.flagged)])
  ));
  let result = next;
  for (const column of TASK_COLUMNS) {
    const cards = next[column] || [];
    const promoted = cards.filter((card) => card.flagged && wasFlagged.get(card.id) === false);
    if (!promoted.length) continue;
    const promotedIds = new Set(promoted.map((card) => card.id));
    result = { ...result, [column]: [...promoted, ...cards.filter((card) => !promotedIds.has(card.id))] };
  }
  return result;
}

// Freeze elapsed time before completing, archiving, or copying a running task.
export function pauseTask(card, now = Date.now()) {
  const linked = linkParentStopwatch(card, now);
  const next = { ...linked, running: false, lastStartTs: null, subtasks: pauseSubtaskStopwatches(linked.subtasks, now) };
  if (linked.running && linked.lastStartTs != null && linked.segments?.length) {
    const active = linked.activeSegmentIndex ?? 0;
    next.segments = linked.segments.map((segment, index) => index === active ? {
      ...segment,
      remainingSec: Math.max(0, (linked.remainingSecAtStart ?? segment.remainingSec) - Math.max(0, now - linked.lastStartTs) / 1000),
    } : { ...segment });
    next.remainingSec = next.segments.reduce((sum, segment) => sum + segment.remainingSec, 0);
    next.remainingSecAtStart = next.segments[active]?.remainingSec ?? 0;
  }
  if (linked.stopwatch) {
    next.stopwatch = {
      ...linked.stopwatch,
      elapsedSec: (linked.stopwatch.elapsedSec || 0) + (linked.stopwatch.running && linked.stopwatch.lastStartTs != null ? Math.max(0, now - linked.stopwatch.lastStartTs) / 1000 : 0),
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
