export function elapsedStopwatch(stopwatch, now = Date.now()) {
  if (!stopwatch) return 0;
  const runningSeconds = stopwatch.running && stopwatch.lastStartTs != null
    ? Math.max(0, now - stopwatch.lastStartTs) / 1000
    : 0;
  return Math.max(0, (stopwatch.elapsedSec || 0) + runningSeconds);
}

export const hasSubtaskStopwatch = (card) => Boolean(card.subtasks?.some((subtask) => subtask.stopwatch));

export function pauseStopwatch(stopwatch, now = Date.now()) {
  return stopwatch?.running
    ? { ...stopwatch, elapsedSec: elapsedStopwatch(stopwatch, now), running: false, lastStartTs: null }
    : stopwatch;
}

export function resumeTaskStopwatch(card, now = Date.now()) {
  if (card.stopwatch?.running || card.subtasks?.some((subtask) => subtask.stopwatch?.running)) return card;
  return { ...card, stopwatch: { elapsedSec: card.stopwatch?.elapsedSec || 0, running: true, lastStartTs: now } };
}

export function resumeSubtaskStopwatch(card, subtaskId, now = Date.now()) {
  const target = card.subtasks?.find((subtask) => subtask.id === subtaskId);
  if (!target || target.stopwatch?.running) return card;
  return {
    ...card,
    stopwatch: pauseStopwatch(card.stopwatch, now) ?? null,
    subtasks: card.subtasks.map((subtask) => subtask.id === subtaskId ? {
      ...subtask,
      stopwatch: { elapsedSec: elapsedStopwatch(subtask.stopwatch, now), running: true, lastStartTs: now },
    } : subtask),
  };
}

export function pauseTaskStopwatches(card, now = Date.now()) {
  return {
    ...card,
    stopwatch: pauseStopwatch(card.stopwatch, now) ?? null,
    subtasks: pauseSubtaskStopwatches(card.subtasks, now),
  };
}

// The parent clock holds time tracked outside a subtask. Its display also
// includes all subtask clocks, so moving a subtask's time here preserves it.
export function transferSubtaskTimeToParent(card, subtaskIds, now = Date.now()) {
  const removed = new Set(subtaskIds);
  const hasRemovedStopwatch = (card.subtasks || []).some((subtask) => removed.has(subtask.id) && subtask.stopwatch);
  if (!hasRemovedStopwatch) return card;
  const transferred = (card.subtasks || []).reduce((total, subtask) =>
    total + (removed.has(subtask.id) ? elapsedStopwatch(subtask.stopwatch, now) : 0), 0);
  const parent = card.stopwatch;
  return {
    ...card,
    stopwatch: {
      elapsedSec: elapsedStopwatch(parent, now) + transferred,
      running: Boolean(parent?.running),
      lastStartTs: parent?.running ? now : null,
    },
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
    ? { ...subtask, stopwatch: pauseStopwatch(subtask.stopwatch, now) }
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

export function editTaskStopwatchTotal(card, requestedSeconds, now = Date.now()) {
  const parentElapsed = elapsedStopwatch(card.stopwatch, now);
  const subtaskElapsed = (card.subtasks || []).reduce((total, subtask) => total + elapsedStopwatch(subtask.stopwatch, now), 0);
  const difference = Math.max(0, Math.floor(requestedSeconds)) - parentElapsed - subtaskElapsed;
  const nextParentElapsed = Math.max(0, parentElapsed + difference);
  const parent = card.stopwatch;
  return {
    ...card,
    stopwatch: parent || nextParentElapsed ? {
      elapsedSec: nextParentElapsed,
      running: Boolean(parent?.running),
      lastStartTs: parent?.running ? now : null,
    } : null,
    subtasks: difference < -parentElapsed
      ? editSubtaskStopwatchTotal(card.subtasks || [], Math.max(0, Math.floor(requestedSeconds)), now)
      : card.subtasks,
  };
}
