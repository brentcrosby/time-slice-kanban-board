export function elapsedStopwatch(stopwatch, now = Date.now()) {
  if (!stopwatch) return 0;
  const runningSeconds = stopwatch.running && stopwatch.lastStartTs != null
    ? Math.max(0, now - stopwatch.lastStartTs) / 1000
    : 0;
  return Math.max(0, (stopwatch.elapsedSec || 0) + runningSeconds);
}

export function materializeSubtaskStopwatches(card, now = Date.now()) {
  if (!card.subtasks?.some((subtask) => subtask.stopwatch)) return card;
  const subtasks = card.subtasks.map((subtask) => subtask.stopwatch
    ? { ...subtask, computedStopwatchElapsed: elapsedStopwatch(subtask.stopwatch, now) }
    : subtask);
  return {
    ...card,
    subtasks,
    computedSubtaskStopwatchElapsed: subtasks.reduce((total, subtask) => total + (subtask.computedStopwatchElapsed || 0), 0),
  };
}

export function pauseSubtaskStopwatches(subtasks = [], now = Date.now()) {
  return subtasks.map((subtask) => subtask.stopwatch?.running
    ? { ...subtask, stopwatch: { elapsedSec: elapsedStopwatch(subtask.stopwatch, now), running: false, lastStartTs: null } }
    : subtask);
}
