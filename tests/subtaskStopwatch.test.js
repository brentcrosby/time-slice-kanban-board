import test from "node:test";
import assert from "node:assert/strict";
import {
  editTaskStopwatchTotal, elapsedStopwatch, materializeSubtaskStopwatches,
  pauseTaskStopwatches, resumeSubtaskStopwatch, resumeTaskStopwatch,
  transferSubtaskTimeToParent,
} from "../src/utils/subtaskStopwatch.js";

test("main play runs independently of paused subtask clocks and pause freezes both", () => {
  const card = {
    stopwatch: null,
    subtasks: [
      { id: "a", stopwatch: { elapsedSec: 677, running: false, lastStartTs: null } },
      { id: "b", stopwatch: null },
    ],
  };
  const started = resumeTaskStopwatch(card, 1000);
  assert.equal(started.stopwatch.running, true);
  assert.equal(started.subtasks[0].stopwatch.running, false);
  assert.equal(started.subtasks[1].stopwatch, null);
  assert.equal(materializeSubtaskStopwatches(started, 6000).computedSubtaskStopwatchElapsed, 682);

  const paused = pauseTaskStopwatches(started, 6000);
  assert.equal(paused.stopwatch.elapsedSec, 5);
  assert.equal(paused.subtasks[0].stopwatch.elapsedSec, 677);
  assert.equal(materializeSubtaskStopwatches(paused, 9000).computedSubtaskStopwatchElapsed, 682);
});

test("starting a subtask freezes standalone task time and removing it preserves total", () => {
  const card = {
    stopwatch: { elapsedSec: 60, running: true, lastStartTs: 1000 },
    subtasks: [{ id: "a", stopwatch: { elapsedSec: 20, running: false, lastStartTs: null } }],
  };
  const activeSubtask = resumeSubtaskStopwatch(card, "a", 6000);
  assert.equal(activeSubtask.stopwatch.elapsedSec, 65);
  assert.equal(activeSubtask.stopwatch.running, false);
  assert.equal(elapsedStopwatch(activeSubtask.subtasks[0].stopwatch, 10000), 24);

  const transferred = transferSubtaskTimeToParent(activeSubtask, ["a"], 10000);
  const removed = { ...transferred, subtasks: [{ id: "a", stopwatch: null }] };
  assert.equal(removed.stopwatch.elapsedSec, 89);
  assert.equal(resumeTaskStopwatch(removed, 11000).stopwatch.elapsedSec, 89);
  assert.equal(materializeSubtaskStopwatches(activeSubtask, 10000).computedSubtaskStopwatchElapsed, 89);
});

test("starting and pausing a subtask without a main clock keeps the parent Firestore-safe", () => {
  const card = { id: "task", title: "Work", subtasks: [{ id: "a", title: "First" }] };
  const started = resumeSubtaskStopwatch(card, "a", 1000);
  assert.equal(started.stopwatch, null);
  assert.deepEqual(started.subtasks[0].stopwatch, { elapsedSec: 0, running: true, lastStartTs: 1000 });
  const paused = pauseTaskStopwatches(started, 6000);
  assert.equal(paused.stopwatch, null);
  assert.equal(paused.subtasks[0].stopwatch.elapsedSec, 5);
  assert.equal(pauseTaskStopwatches(card, 6000).stopwatch, null);
});

test("editing total accounts for parent time and subtask time", () => {
  const card = {
    stopwatch: { elapsedSec: 40, running: false, lastStartTs: null },
    subtasks: [{ id: "a", stopwatch: { elapsedSec: 20, running: false, lastStartTs: null } }],
  };
  assert.equal(materializeSubtaskStopwatches(editTaskStopwatchTotal(card, 90), 0).computedSubtaskStopwatchElapsed, 90);
  assert.equal(materializeSubtaskStopwatches(editTaskStopwatchTotal(card, 10), 0).computedSubtaskStopwatchElapsed, 10);
});
