import { elapsedStopwatch, pauseStopwatch, pauseSubtaskStopwatches, resumeTaskStopwatch } from "./subtaskStopwatch.js";
import { trackCardWork } from "./workActivity.js";

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
  const next = { ...card, running: false, lastStartTs: null, subtasks: pauseSubtaskStopwatches(card.subtasks, now) };
  if (card.running && card.lastStartTs != null && card.segments?.length) {
    const active = card.activeSegmentIndex ?? 0;
    next.segments = card.segments.map((segment, index) => index === active ? {
      ...segment,
      remainingSec: Math.max(0, (card.remainingSecAtStart ?? segment.remainingSec) - Math.max(0, now - card.lastStartTs) / 1000),
    } : { ...segment });
    next.remainingSec = next.segments.reduce((sum, segment) => sum + segment.remainingSec, 0);
    next.remainingSecAtStart = next.segments[active]?.remainingSec ?? 0;
  }
  if (card.stopwatch) next.stopwatch = pauseStopwatch(card.stopwatch, now);
  return trackCardWork(card, next, now);
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

// Only a drop into Doing starts a fresh clock; reorders and menu moves do not.
export function dropTasks(board, ids, destination, index = null, autoStart = false, now = Date.now()) {
  const selected = new Set(ids);
  const next = moveTasks(board, selected, destination, index, now);
  if (!autoStart || destination !== "doing" || next === board) return next;
  const alreadyDoing = new Set((board.doing || []).map((card) => card.id));
  return { ...next, doing: next.doing.map((card) => {
    if (!selected.has(card.id) || alreadyDoing.has(card.id) || card.isDraft || card.running) return card;
    // Untimed tasks have an unstarted stopwatch shortcut. Countdown-only tasks
    // retain their own timer behavior, and linked subtask time is never resumed.
    if (!card.stopwatch && card.durationSec > 0) return card;
    const clocks = [card.stopwatch, ...(card.subtasks || []).map((subtask) => subtask.stopwatch)];
    if (clocks.some((clock) => clock?.running || elapsedStopwatch(clock, now) > 0)) return card;
    return resumeTaskStopwatch(card, now);
  }) };
}

export function copyTask(card, destination, newId, now = Date.now()) {
  const copy = JSON.parse(JSON.stringify(pauseTask(card, now)));
  delete copy.workLog;
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
