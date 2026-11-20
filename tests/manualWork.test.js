import test from "node:test";
import assert from "node:assert/strict";
import { addWorkSession, createLoggedTask, editWorkSession, localDateTimeValue } from "../src/utils/manualWork.js";
import { dailyActivity, trackCardWork } from "../src/utils/workActivity.js";
import { archivedTaskLoggedSeconds } from "../src/utils/archiveGroups.js";

const start = new Date(2026, 9, 9, 8).getTime();
const minute = 60_000;
const now = start + 120 * minute;

test("logging a past run creates a completed archived task with exact chart times and task total", () => {
  const task = createLoggedTask("run", " Morning run ", start, start + 30 * minute, now);
  assert.equal(task.title, "Morning run");
  assert.equal(task.completedAt, start + 30 * minute);
  assert.equal(task.archivedAt, now);
  assert.equal(task.stopwatch.running, false);
  assert.equal(archivedTaskLoggedSeconds(task), 1800);
  const day = dailyActivity([task], now)[0];
  assert.equal(day.seconds, 1800);
  assert.deepEqual(day.tasks[0].intervals, [[start, start + 30 * minute]]);
  const overlap = createLoggedTask("other", "Other", start + 15 * minute, start + 45 * minute, now);
  assert.equal(dailyActivity([task, overlap], now)[0].seconds, 2700);
});

test("adding a past session preserves a live main clock and every subtask clock", () => {
  const task = { id: "a", title: "Study", stopwatch: { elapsedSec: 60, running: true, lastStartTs: start + 60 * minute },
    subtasks: [{ id: "s", stopwatch: { elapsedSec: 30, running: false } }],
    workLog: { since: start + 60 * minute, sessions: [{ clock: "main", start: start + 60 * minute, end: null }] } };
  const logged = addWorkSession(task, start, start + 30 * minute, now);
  assert.equal(logged.stopwatch.elapsedSec, 1860);
  assert.equal(logged.stopwatch.lastStartTs, task.stopwatch.lastStartTs);
  assert.equal(logged.stopwatch.running, true);
  assert.deepEqual(logged.subtasks, task.subtasks);
  assert.equal(trackCardWork(task, logged, now).workLog.sessions.length, 2);
  assert.equal(dailyActivity([logged], now)[0].seconds, 5400);
  assert.equal(task.workLog.sessions.length, 1, "source task is not mutated");
});

test("explicit sessions split at midnight and retain separate task stopwatch duration", () => {
  const end = new Date(2026, 9, 9, 0, 15).getTime();
  const task = createLoggedTask("night", "Night work", end - 30 * minute, end, now);
  const days = dailyActivity([task], now);
  assert.deepEqual(days.map((day) => day.seconds), [900, 900]);
  assert.equal(archivedTaskLoggedSeconds(task), 1800);
  const session = days[0].tasks[0].sessions[0];
  const edited = editWorkSession(task, session, end - 20 * minute, end + 5 * minute, now);
  assert.deepEqual(dailyActivity([edited], now).map((day) => day.seconds), [1200, 300]);
  assert.equal(archivedTaskLoggedSeconds(edited), 1500);
});

test("editing one of two overlapping sessions leaves the other clock and session alone", () => {
  const task = createLoggedTask("study", "Study", start, start + 30 * minute, now);
  task.subtasks = [{ id: "reading", title: "Reading", stopwatch: { elapsedSec: 1200, running: false } }];
  task.workLog.sessions.push({ clock: "sub:reading", start: start + 20 * minute, end: start + 40 * minute });
  const taskDay = dailyActivity([task], now)[0].tasks[0];
  assert.equal(taskDay.intervals.length, 1);
  assert.equal(taskDay.sessions.length, 2);
  const reference = taskDay.sessions[1];
  const edited = editWorkSession(task, reference, start + 15 * minute, start + 45 * minute, now);
  assert.equal(edited.subtasks[0].stopwatch.elapsedSec, 1800);
  assert.equal(edited.stopwatch, task.stopwatch);
  assert.equal(edited.workLog.sessions[0], task.workLog.sessions[0]);
  assert.equal(dailyActivity([edited], now)[0].seconds, 2700);
  assert.equal(editWorkSession(edited, reference, start, now, now), edited, "stale references cannot overwrite a corrected session");
});

test("invalid or future intervals and blank titles cannot be saved", () => {
  for (const [a, b] of [[NaN, now], [start, start], [now, start], [start, now + minute]]) {
    assert.throws(() => createLoggedTask("a", "Work", a, b, now));
  }
  assert.throws(() => createLoggedTask("a", "  ", start, now, now));
});

test("datetime input values use local time, including the day around UTC midnight", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try { assert.equal(localDateTimeValue(Date.parse("2026-10-10T03:30:00Z")), "2026-10-09T20:30"); }
  finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
