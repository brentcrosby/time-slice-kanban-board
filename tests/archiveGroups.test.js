import test from "node:test";
import assert from "node:assert/strict";
import { archivedTaskLoggedSeconds, groupArchivedCardsByDay } from "../src/utils/archiveGroups.js";

const localTimestamp = (year, month, day, hour = 12) => new Date(year, month - 1, day, hour).getTime();

test("archive cards are grouped by completion day, newest first, with today and yesterday labels", () => {
  const now = new Date(2026, 8, 29, 10);
  const cards = [
    { id: "old", archivedAt: localTimestamp(2026, 8, 27) },
    { id: "today-a", archivedAt: localTimestamp(2026, 9, 29, 9) },
    { id: "yesterday", archivedAt: localTimestamp(2026, 9, 28) },
    { id: "today-b", archivedAt: localTimestamp(2026, 9, 29, 8) },
  ];
  const groups = groupArchivedCardsByDay(cards, now);
  assert.deepEqual(groups.map(({ label }) => label), ["Today", "Yesterday", "Thursday, August 27, 2026"]);
  assert.deepEqual(groups[0].cards.map(({ id }) => id), ["today-a", "today-b"]);
});

test("archive date is the fallback for older completed cards and missing dates go last", () => {
  const now = new Date(2026, 8, 29);
  const groups = groupArchivedCardsByDay([
    { id: "missing" },
    { id: "completed", completedAt: localTimestamp(2026, 9, 28), archivedAt: localTimestamp(2026, 9, 29) },
    { id: "archived", archivedAt: localTimestamp(2026, 9, 29) },
  ], now);
  assert.deepEqual(groups.map(({ label }) => label), ["Today", "Yesterday", "Date unavailable"]);
  assert.equal(groups[0].cards[0].id, "archived");
});

test("daily totals count completed tasks and sum parent and subtask stopwatch time without planned duration", () => {
  const completedAt = localTimestamp(2026, 9, 28);
  const groups = groupArchivedCardsByDay([
    { id: "first", completedAt, archivedAt: localTimestamp(2026, 9, 29), durationSec: 3600,
      stopwatch: { elapsedSec: 30 }, subtasks: [{ stopwatch: { elapsedSec: 45 } }, { stopwatch: { elapsedSec: 15 } }] },
    { id: "second", completedAt, subtasks: [{ stopwatch: { elapsedSec: 60 } }] },
    { id: "different", completedAt: localTimestamp(2026, 9, 29), stopwatch: { elapsedSec: 10 } },
  ], new Date(2026, 8, 29));

  assert.equal(groups[0].cards.length, 1);
  assert.equal(groups[0].loggedSeconds, 10);
  assert.equal(groups[1].cards.length, 2);
  assert.equal(groups[1].loggedSeconds, 150);
  assert.equal(archivedTaskLoggedSeconds({ durationSec: 3600 }), 0);
});
