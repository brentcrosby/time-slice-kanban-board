import test from "node:test";
import assert from "node:assert/strict";
import { copyTask, moveTasks, pauseTask, promoteNewlyFlagged, selectionRange } from "../src/utils/taskActions.js";
import { boardFingerprint, mergeBoards } from "../src/utils/boardSync.js";

test("bulk moves complete tasks, pause running clocks, and retain data", () => {
  const task = { id: "a", title: "A", flagged: true, subtasks: [{ id: "sub", completed: true }], stopwatch: { elapsedSec: 3, running: true, lastStartTs: 1000 } };
  const board = { todo: [task], doing: [{ id: "b" }], done: [{ id: "c", completedAt: 500 }] };
  const moved = moveTasks(board, ["a", "b"], "done", 0, 6000);
  assert.deepEqual(moved.done.map((card) => card.id), ["a", "b", "c"]);
  assert.equal(moved.done[0].completedAt, 6000);
  assert.equal(moved.done[0].stopwatch.elapsedSec, 8);
  assert.equal(moved.done[0].stopwatch.running, false);
  assert.deepEqual(moved.done[0].subtasks, task.subtasks);
  assert.equal(moved.done[0].flagged, true);
  assert.equal(board.todo.length, 1);
  assert.equal(task.stopwatch.running, true);
});

test("reordering selected tasks preserves order and completion dates", () => {
  const done = ["a", "b", "c", "d"].map((id) => ({ id, completedAt: 10 }));
  const next = moveTasks({ todo: [], doing: [], done }, ["a", "c"], "done", 4, 20);
  assert.deepEqual(next.done.map((card) => card.id), ["b", "d", "a", "c"]);
  assert.equal(next.done[2].completedAt, 10);
  const reopened = moveTasks(next, ["a"], "todo", null, 30);
  assert.equal(reopened.todo[0].completedAt, null);
  assert.equal(moveTasks(next, ["missing"], "todo"), next);
});

test("newly flagged tasks move to the top of their own column in stable order", () => {
  const board = {
    todo: [{ id: "a" }, { id: "b", flagged: true }, { id: "c" }, { id: "d" }],
    doing: [{ id: "e" }, { id: "f" }],
    done: [{ id: "g" }, { id: "h" }],
  };
  const flagged = {
    todo: board.todo.map((card) => ["c", "d"].includes(card.id) ? { ...card, flagged: true } : card),
    doing: board.doing.map((card) => card.id === "f" ? { ...card, flagged: true } : card),
    done: board.done.map((card) => card.id === "h" ? { ...card, flagged: true } : card),
  };
  const promoted = promoteNewlyFlagged(board, flagged);
  assert.deepEqual(promoted.todo.map((card) => card.id), ["c", "d", "a", "b"]);
  assert.deepEqual(promoted.doing.map((card) => card.id), ["f", "e"]);
  assert.deepEqual(promoted.done.map((card) => card.id), ["h", "g"]);
  assert.deepEqual(board.todo.map((card) => card.id), ["a", "b", "c", "d"]);
  assert.equal(promoteNewlyFlagged(promoted, promoted), promoted);
  const reordered = { ...promoted, todo: [promoted.todo[2], ...promoted.todo.filter((card) => card.id !== "a")] };
  assert.deepEqual(promoteNewlyFlagged(promoted, reordered).todo, reordered.todo);
});

test("copying and archiving capture elapsed countdown time without mutating source", () => {
  const task = { id: "a", running: true, lastStartTs: 1000, remainingSecAtStart: 30, activeSegmentIndex: 0, segments: [{ id: "seg", durationSec: 30, remainingSec: 30 }], subtasks: [{ id: "sub", title: "detail" }], completedAt: 100 };
  const frozen = pauseTask(task, 6000);
  assert.equal(frozen.remainingSec, 25);
  const copy = copyTask(task, "todo", "copy", 6000);
  assert.equal(copy.running, false);
  assert.equal(copy.remainingSecAtStart, 25);
  assert.equal(copy.completedAt, null);
  assert.notEqual(copy.subtasks[0].id, task.subtasks[0].id);
  copy.subtasks[0].title = "changed";
  assert.equal(task.subtasks[0].title, "detail");
  assert.equal(copyTask(task, "done", "copy2", 6000).completedAt, 6000);
});

test("range selection works forwards, backwards, across columns, and without an anchor", () => {
  const ids = ["do-1", "do-2", "doing-1", "done-1"];
  assert.deepEqual(selectionRange(ids, "done-1", "do-2"), ids.slice(1));
  assert.deepEqual(selectionRange(ids, "do-1", "doing-1"), ids.slice(0, 3));
  assert.deepEqual(selectionRange(ids, "missing", "done-1"), ["done-1"]);
});

test("sync and merge preserve flags and archive dates, including undated legacy tasks", () => {
  const card = { id: "a", flagged: true, completedAt: 100, archivedAt: 200 };
  const state = { cardsByCol: { todo: [], doing: [], done: [] }, archivedCards: [card] };
  const merged = mergeBoards(state, { ...state, archivedCards: [{ id: "legacy" }] });
  assert.deepEqual(merged.archivedCards, [{ id: "legacy" }, card]);
  assert.notEqual(boardFingerprint(state), boardFingerprint({ ...state, archivedCards: [{ ...card, flagged: false }] }));
});
