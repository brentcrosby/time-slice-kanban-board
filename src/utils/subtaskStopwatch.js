export function elapsedStopwatch(stopwatch, now = Date.now()) {
  if (!stopwatch) return 0;
  const runningSeconds = stopwatch.running && stopwatch.lastStartTs != null
    ? Math.max(0, now - stopwatch.lastStartTs) / 1000
    : 0;
  return Math.max(0, (stopwatch.elapsedSec || 0) + runningSeconds);
}

export const hasSubtaskStopwatch = (card) => Boolean(card.subtasks?.some((subtask) => subtask.stopwatch));

// Old tasks can have a standalone task clock and a subtask clock at once.
// Transfer the standalone elapsed time into one subtask before linked actions.
export function linkParentStopwatch(card, now = Date.now()) {
  if (!card.stopwatch || !hasSubtaskStopwatch(card)) return card;
  const firstId = card.subtasks.find((subtask) => subtask.stopwatch).id;
  const transferred = elapsedStopwatch(card.stopwatch, now);
  return {
    ...card,
    stopwatch: null,
    subtasks: card.subtasks.map((subtask) => subtask.id === firstId ? {
      ...subtask,
      stopwatch: { ...subtask.stopwatch, elapsedSec: (subtask.stopwatch.elapsedSec || 0) + transferred },
    } : subtask),
  };
}

export function materializeSubtaskStopwatches(card, now = Date.now()) {
  if (!card.subtasks?.some((subtask) => subtask.stopwatch)) return card;
  const subtasks = card.subtasks.map((subtask) => subtask.stopwatch
    ? { ...subtask, computedStopwatchElapsed: elapsedStopwatch(subtask.stopwatch, now) }
    : subtask);
  return {
    ...card,
    subtasks,
    computedSubtaskStopwatchElapsed: subtasks.reduce((total, subtask) => total + (subtask.computedStopwatchElapsed || 0), 0) + elapsedStopwatch(card.stopwatch, now),
  };
}

export function pauseSubtaskStopwatches(subtasks = [], now = Date.now()) {
  return subtasks.map((subtask) => subtask.stopwatch?.running
    ? { ...subtask, stopwatch: { elapsedSec: elapsedStopwatch(subtask.stopwatch, now), running: false, lastStartTs: null } }
    : subtask);
}

export function editSubtaskStopwatchTotal(subtasks, requestedSeconds, now = Date.now()) {
  const timed = subtasks.filter((subtask) => subtask.stopwatch);
  if (!timed.length) return subtasks;
  const elapsed = new Map(timed.map((subtask) => [subtask.id, elapsedStopwatch(subtask.stopwatch, now)]));
  let difference = Math.max(0, Math.floor(requestedSeconds)) - [...elapsed.values()].reduce((sum, seconds) => sum + seconds, 0);
  if (difference >= 0) {
    const recipient = timed.find((subtask) => subtask.stopwatch.running) || timed[0];
    elapsed.set(recipient.id, elapsed.get(recipient.id) + difference);
  } else {
    for (const subtask of [...timed].reverse()) {
      const deduction = Math.min(elapsed.get(subtask.id), -difference);
      elapsed.set(subtask.id, elapsed.get(subtask.id) - deduction);
      difference += deduction;
      if (difference >= 0) break;
    }
  }
  return subtasks.map((subtask) => subtask.stopwatch ? {
    ...subtask,
    stopwatch: {
      ...subtask.stopwatch,
      elapsedSec: elapsed.get(subtask.id),
      lastStartTs: subtask.stopwatch.running ? now : null,
    },
  } : subtask);
}
