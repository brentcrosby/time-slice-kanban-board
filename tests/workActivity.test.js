import test from "node:test";
import assert from "node:assert/strict";
import { correctWorkTime, dailyActivity, restoreWorkBoard, trackBoardWork, trackCardWork } from "../src/utils/workActivity.js";
import { copyTask, pauseTask } from "../src/utils/taskActions.js";
import { editTaskStopwatchTotal, resumeTaskStopwatch, transferSubtaskTimeToParent } from "../src/utils/subtaskStopwatch.js";
import { savedBoard, boardFingerprint } from "../src/utils/boardSync.js";

const hour = 3600000;
const base = new Date(2026, 9, 4, 9).getTime();
const card = (id, start, end, clock = "main") => ({ id, title: `Task ${id}`, stopwatch: { elapsedSec: (end - start) / 1000, running: false }, workLog: { since: start, sessions: [{ clock, start, end }] } });
const today = (cards, now = base + 8 * hour) => dailyActivity(cards, now)[0];

test("unfinished work counts on its actual day and overlaps count once", () => {
  const a = card("a", base, base + 2 * hour);
  const b = card("b", base + hour, base + 3 * hour);
  const day = today([a, b]);
  assert.equal(day.seconds, 3 * 3600);
  assert.deepEqual(day.tasks.map((task) => task.seconds), [7200, 7200]);
  assert.equal(day.tasks[0].completed, false);
});

test("midnight splits work into local days; DST days use calendar boundaries", () => {
  const previousTZ = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const start = new Date(2026, 10, 1, 0).getTime();
    const end = new Date(2026, 10, 2, 1).getTime();
    const days = dailyActivity([card("a", start, end)], end);
    assert.equal(days[0].seconds, 3600);
    assert.equal(days[1].seconds, 25 * 3600);
    assert.equal(days[1].end - days[1].start, 25 * hour);
  } finally { if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ; }
});

test("open sessions survive reload and accrue while the app is closed", () => {
  const started = trackCardWork(null, resumeTaskStopwatch({ id: "a", title: "Work" }, base), base);
  const reload = trackCardWork(null, JSON.parse(JSON.stringify(started)), base + hour);
  assert.equal(reload.workLog.sessions.length, 1);
  assert.equal(reload.workLog.sessions[0].start, base);
  assert.equal(today([reload], base + 2 * hour).seconds, 7200);
  const paused = pauseTask(reload, base + 2 * hour);
  assert.equal(today([paused], base + 4 * hour).seconds, 7200);
});

test("legacy stopwatch totals are not invented as historical sessions", () => {
  const legacy = { id: "a", title: "Work", stopwatch: { elapsedSec: 10000, running: true, lastStartTs: base - hour } };
  const tracked = trackCardWork(null, legacy, base);
  assert.equal(today([tracked], base + hour).seconds, 3600);
  assert.equal(today([{ ...legacy, stopwatch: { elapsedSec: 10000 } }]).seconds, 0);
});

test("backward edits trim latest work without subtracting another task's overlapping work", () => {
  const a = card("a", base, base + 2 * hour);
  const b = card("b", base + hour, base + 3 * hour);
  const edited = correctWorkTime(a, editTaskStopwatchTotal(a, 3600, base + 4 * hour), base + 4 * hour);
  assert.equal(today([edited, b]).seconds, 3 * 3600);
  assert.equal(today([edited]).seconds, 3600);
  const shortenedB = correctWorkTime(b, editTaskStopwatchTotal(b, 1800, base + 4 * hour), base + 4 * hour);
  assert.equal(today([edited, shortenedB]).seconds, 5400);
});

test("running corrections trim past time and continue at the edit timestamp", () => {
  const started = trackCardWork(null, resumeTaskStopwatch({ id: "a", title: "Work" }, base), base);
  const edited = correctWorkTime(started, editTaskStopwatchTotal(started, 1800, base + hour), base + hour);
  assert.deepEqual(edited.workLog.sessions.map((s) => [s.start, s.end]), [[base, base + hour / 2], [base + hour, null]]);
  assert.equal(today([edited], base + 2 * hour).seconds, 5400);
});

test("subtask corrections are scoped; main corrections also cover transferred subtask time", () => {
  const original = { ...card("a", base, base + hour, "sub:s"), stopwatch: null,
    subtasks: [{ id: "s", stopwatch: { elapsedSec: 3600, running: false } }] };
  const edited = correctWorkTime(original, { ...original, subtasks: [{ id: "s", stopwatch: { elapsedSec: 1800 } }] }, base + 2 * hour, "sub:s");
  assert.equal(today([edited]).seconds, 1800);
  const transferred = { ...transferSubtaskTimeToParent(original, ["s"], base + 2 * hour), subtasks: [] };
  const mainEdited = correctWorkTime(transferred, editTaskStopwatchTotal(transferred, 900), base + 2 * hour);
  assert.equal(today([mainEdited]).seconds, 900);
});

test("latest sessions are trimmed across days and zero-length sessions are removed", () => {
  const earlier = base - 24 * hour;
  const task = { ...card("a", base, base + hour), stopwatch: { elapsedSec: 7200 },
    workLog: { since: earlier, sessions: [{ clock: "main", start: earlier, end: earlier + hour }, { clock: "main", start: base, end: base + hour }] } };
  const edited = correctWorkTime(task, editTaskStopwatchTotal(task, 1800), base + 2 * hour);
  const days = dailyActivity([edited], base + 3 * hour);
  assert.equal(days[0].seconds, 0);
  assert.equal(days[1].seconds, 1800);
});

test("reset, removal, deletion and archival preserve activity; copies do not inherit it", () => {
  const running = trackCardWork(null, resumeTaskStopwatch({ id: "a", title: "Work" }, base), base);
  const cleared = trackCardWork(running, { ...running, stopwatch: null }, base + hour);
  assert.equal(today([cleared]).seconds, 3600);
  const deleted = trackBoardWork({ cardsByCol: { todo: [], doing: [running], done: [] }, archivedCards: [] }, { todo: [], doing: [], done: [] }, base + hour);
  assert.equal(deleted.archivedCards[0].activityOnly, true);
  assert.equal(today(deleted.archivedCards).seconds, 3600);
  const archived = { ...pauseTask(running, base + hour), archivedAt: base + hour, completedAt: base + hour };
  assert.equal(today([archived]).seconds, 3600);
  assert.equal(copyTask(archived, "todo", "new", base + 2 * hour).workLog, undefined);
  const restored = trackBoardWork(deleted, { todo: [cleared], doing: [], done: [] }, base + 2 * hour);
  assert.equal(restored.archivedCards.length, 0);
});

test("history survives persistence and duplicate card IDs cannot double-count tasks", () => {
  const task = card("a", base, base + hour);
  const state = savedBoard({ cardsByCol: { doing: [task] }, archivedCards: [] });
  const reloaded = JSON.parse(JSON.stringify(state));
  assert.equal(boardFingerprint(state), boardFingerprint(reloaded));
  assert.equal(today([...reloaded.cardsByCol.doing, task]).tasks.length, 1);
});


test("undo preserves work after the snapshot and keeps history when undo removes a task", () => {
  const snapshot = { cardsByCol: { todo: [{ id: "a", title: "Before" }], doing: [], done: [] }, archivedCards: [] };
  const task = card("a", base, base + hour);
  const current = { cardsByCol: { todo: [], doing: [task], done: [] }, archivedCards: [] };
  const undo = restoreWorkBoard(current, snapshot, base + 2 * hour);
  assert.equal(undo.cardsByCol.todo[0].title, "Before");
  assert.equal(today(undo.cardsByCol.todo).seconds, 3600);
  const removed = restoreWorkBoard(current, { cardsByCol: { todo: [], doing: [], done: [] }, archivedCards: [] }, base + 2 * hour);
  assert.equal(removed.archivedCards[0].activityOnly, true);
  assert.equal(today(removed.archivedCards).seconds, 3600);
});
