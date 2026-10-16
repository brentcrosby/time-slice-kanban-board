import test from "node:test";
import assert from "node:assert/strict";
import { archiveDoneBeforeToday, nextLocalMidnight } from "../src/utils/dailyArchive.js";
import { archivedTaskLoggedSeconds, groupArchivedCardsByDay } from "../src/utils/archiveGroups.js";

const date = (day, hour = 0, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const task = (id, completedAt) => ({ id, title: id, completedAt, subtasks: [] });
const board = (done) => ({ cardsByCol: { todo: [task("todo", null)], doing: [task("doing", null)], done }, archivedCards: [] });

test("Done tasks stay until local midnight, then move atomically without changing completion dates", () => {
  const completed = { ...task("done", date(15, 18)), stopwatch: { elapsedSec: 1800, running: false },
    workLog: { since: date(15, 17), sessions: [{ clock: "main", start: date(15, 17), end: date(15, 17, 30) }] } };
  const original = board([completed]);
  assert.equal(archiveDoneBeforeToday(original, date(15, 23, 59)), original);
  const result = archiveDoneBeforeToday(original, date(16));
  assert.deepEqual(result.cardsByCol.done, []);
  assert.equal(result.cardsByCol.todo, original.cardsByCol.todo);
  assert.equal(result.cardsByCol.doing, original.cardsByCol.doing);
  assert.equal(result.archivedCards[0].completedAt, completed.completedAt);
  assert.equal(result.archivedCards[0].archivedAt, date(16));
  assert.deepEqual(result.archivedCards[0].workLog, completed.workLog);
  assert.equal(archivedTaskLoggedSeconds(result.archivedCards[0]), 1800);
  assert.equal(groupArchivedCardsByDay(result.archivedCards, new Date(date(16)))[0].label, "Yesterday");
  assert.equal(archiveDoneBeforeToday(result, date(16, 9)), result, "repeated checks do not duplicate tasks");
  assert.equal(original.cardsByCol.done.length, 1, "the source board is not mutated");
});

test("reopening after several days archives overdue tasks and keeps today's tasks and drafts", () => {
  const draft = { id: "draft", title: "", isDraft: true };
  const original = board([task("older", date(12, 8)), task("yesterday", date(15, 23)), task("today", date(16)), draft]);
  const result = archiveDoneBeforeToday(original, date(16, 9));
  assert.deepEqual(result.cardsByCol.done.map((card) => card.id), ["today", "draft"]);
  assert.deepEqual(result.archivedCards.map((card) => card.id), ["older", "yesterday"]);
});

test("catch-up freezes clocks and ends their sessions at the midnight when archiving was due", () => {
  const start = date(15, 23, 30);
  const completed = { ...task("running", start), stopwatch: { elapsedSec: 0, running: true, lastStartTs: start },
    subtasks: [{ id: "s", stopwatch: { elapsedSec: 10, running: true, lastStartTs: start } }],
    workLog: { since: start, sessions: [{ clock: "main", start, end: null }, { clock: "sub:s", start, end: null }] } };
  const result = archiveDoneBeforeToday(board([completed]), date(16, 10)).archivedCards[0];
  assert.equal(result.stopwatch.elapsedSec, 1800);
  assert.equal(result.stopwatch.running, false);
  assert.equal(result.subtasks[0].stopwatch.elapsedSec, 1810);
  assert.equal(result.subtasks[0].stopwatch.running, false);
  assert.ok(result.workLog.sessions.every((session) => session.end === date(16)));
});

test("restored tasks get the current day; undated legacy tasks get one day before auto-archiving", () => {
  const restored = { ...task("restored", date(12)), doneSince: date(16, 8) };
  assert.equal(archiveDoneBeforeToday(board([restored]), date(16, 9)).cardsByCol.done.length, 1);
  assert.equal(archiveDoneBeforeToday(board([restored]), date(17)).archivedCards.length, 1);
  const original = board([task("legacy", null)]);
  const anchored = archiveDoneBeforeToday(original, date(16, 9));
  assert.equal(anchored.cardsByCol.done[0].doneSince, date(16, 9));
  assert.equal(archiveDoneBeforeToday(anchored, date(17)).archivedCards.length, 1);
});

test("local midnight follows 23- and 25-hour daylight saving days", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try {
    for (const [month, day, hours] of [[2, 8, 23], [10, 1, 25]]) {
      const start = new Date(2026, month, day).getTime();
      assert.equal(nextLocalMidnight(start) - start, hours * 3600_000);
      assert.equal(new Date(nextLocalMidnight(start)).getHours(), 0);
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
