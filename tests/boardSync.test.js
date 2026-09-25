import test from "node:test";
import assert from "node:assert/strict";
import { boardFingerprint, incomingSyncAction, initialSyncAction, mergeBoards } from "../src/utils/boardSync.js";

const board = (todo = [], doing = [], done = []) => ({
  cardsByCol: { todo, doing, done },
  autoMoveEnabled: true,
});
const task = (id, title) => ({ id, title, subtasks: [] });

test("field order does not create a false conflict on reload", () => {
  const local = board([task("a", "Write")]);
  const remote = { autoMoveEnabled: true, cardsByCol: { done: [], doing: [], todo: [{ subtasks: [], title: "Write", id: "a" }] } };
  assert.equal(boardFingerprint(local), boardFingerprint(remote));
  assert.equal(initialSyncAction(local, remote, null), "same");
});

test("a previously synced device accepts newer account changes without prompting", () => {
  const local = board([task("a", "Write")]);
  const remote = board([task("a", "Write"), task("b", "Review")]);
  assert.equal(initialSyncAction(local, remote, boardFingerprint(local)), "remote");
  assert.equal(incomingSyncAction(local, remote, boardFingerprint(local)), "remote");
});

test("device-only changes upload and concurrent changes ask for a choice", () => {
  const original = board([task("a", "Write")]);
  const local = board([task("a", "Write"), task("b", "Review")]);
  const remote = board([task("a", "Write"), task("c", "Publish")]);
  assert.equal(initialSyncAction(local, original, boardFingerprint(original)), "local");
  assert.equal(initialSyncAction(local, remote, boardFingerprint(original)), "conflict");
  assert.equal(incomingSyncAction(local, remote, boardFingerprint(original)), "conflict");
});

test("merge keeps remote tasks, device-only tasks, and both edits of one task", () => {
  const remote = board([task("same", "Remote title"), task("remote", "Remote only")]);
  const local = board([task("same", "Device title"), task("local", "Device only")]);
  const merged = mergeBoards(local, remote);
  const cards = merged.cardsByCol.todo;
  assert.equal(cards.length, 4);
  assert.deepEqual(cards.slice(0, 2), remote.cardsByCol.todo);
  assert.ok(cards.some((card) => card.id === "local"));
  assert.ok(cards.some((card) => card.title === "Device title (device copy)" && card.id !== "same"));
});

test("merge does not duplicate an unchanged shared task", () => {
  const local = board([task("same", "Write")]);
  assert.equal(mergeBoards(local, board([task("same", "Write")])).cardsByCol.todo.length, 1);
});
