import test from "node:test";
import assert from "node:assert/strict";
import { groupArchivedCardsByDay } from "../src/utils/archiveGroups.js";

const localTimestamp = (year, month, day, hour = 12) => new Date(year, month - 1, day, hour).getTime();

test("archive cards are grouped by archive day, newest first, with today and yesterday labels", () => {
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

test("completion date is the fallback for older archived cards and missing dates go last", () => {
  const now = new Date(2026, 8, 29);
  const groups = groupArchivedCardsByDay([
    { id: "missing" },
    { id: "completed", completedAt: localTimestamp(2026, 9, 28) },
    { id: "archived", archivedAt: localTimestamp(2026, 9, 29), completedAt: localTimestamp(2026, 8, 20) },
  ], now);
  assert.deepEqual(groups.map(({ label }) => label), ["Today", "Yesterday", "Date unavailable"]);
  assert.equal(groups[0].cards[0].id, "archived");
});
