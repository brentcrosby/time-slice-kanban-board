import test from "node:test";
import assert from "node:assert/strict";
import { addWorkSession, createLoggedTask, localDateTimeValue } from "../src/utils/manualWork.js";
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
