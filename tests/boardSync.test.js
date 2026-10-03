import test from "node:test";
import assert from "node:assert/strict";
import { boardFingerprint, incomingSyncAction, initialSyncAction, mergeBoards, savedBoard } from "../src/utils/boardSync.js";

const board = (todo = [], doing = [], done = []) => ({
  cardsByCol: { todo, doing, done },
  autoMoveEnabled: true,
});
const task = (id, title) => ({ id, title, subtasks: [] });

test("restored sessions use the account board even with divergent device changes or a missing baseline", () => {
  const local = { ...board([task("a", "Device copy")]), syncRevision: 12 };
  const remote = { ...board([task("a", "Account copy")]), syncRevision: 10 };
  assert.equal(initialSyncAction(local, remote, null, 0, false), "remote");
  assert.equal(initialSyncAction(local, remote, boardFingerprint(remote), 10, false), "remote");
  assert.equal(initialSyncAction(local, remote, null, 0, true), "conflict");
});

test("saved boards exclude transient drafts and legacy blank titles in every column and archive", () => {
  const valid = task("valid", "Keep me");
  const invalid = [{ id: "draft", title: "", isDraft: true }, { id: "blank", title: "  " }, { id: "missing" }];
  const state = { ...board([valid, ...invalid], invalid, invalid), archivedCards: [valid, ...invalid], syncRevision: 7 };
  const saved = savedBoard(state);
  assert.deepEqual(saved.cardsByCol, { todo: [valid], doing: [], done: [] });
  assert.deepEqual(saved.archivedCards, [valid]);
  assert.equal(saved.syncRevision, 7);
  assert.equal(state.cardsByCol.todo.length, 4, "the active editor is not mutated");
});

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
  const original = { ...board([task("a", "Write")]), syncRevision: 4 };
  const local = { ...board([task("a", "Write"), task("b", "Review")]), syncRevision: 5 };
  const remote = { ...board([task("a", "Write"), task("c", "Publish")]), syncRevision: 5 };
  assert.equal(initialSyncAction(local, original, boardFingerprint(original), 4), "local");
  assert.equal(initialSyncAction(local, remote, boardFingerprint(original), 4), "conflict");
  assert.equal(incomingSyncAction(local, remote, boardFingerprint(original), 4), "conflict");
});

test("stale phone content never replaces a newer cloud board even when its saved baseline matches cloud", () => {
  const stalePhone = { ...board([task("a", "Old title")]), syncRevision: 4 };
  const currentCloud = { ...board([task("a", "New title")]), syncRevision: 8 };
  assert.equal(initialSyncAction(stalePhone, currentCloud, boardFingerprint(currentCloud), 8), "remote");
  assert.equal(incomingSyncAction(stalePhone, currentCloud, boardFingerprint(currentCloud), 8), "remote");
});

test("a legacy device with different content cannot automatically upload over a cloud board", () => {
  const oldPhone = board([task("a", "Old title")]);
  const cloud = board([task("a", "New title")]);
  assert.equal(initialSyncAction(oldPhone, cloud, boardFingerprint(cloud)), "conflict");
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

test("archive data is part of the sync fingerprint and legacy boards default to an empty archive", () => {
  const local = board([task("todo", "Write")]);
  const legacyRemote = { ...board([task("todo", "Write")]), archivedCards: undefined };
  assert.equal(boardFingerprint(local), boardFingerprint(legacyRemote));

  const archived = { ...local, archivedCards: [task("done", "Finished")] };
  assert.notEqual(boardFingerprint(local), boardFingerprint(archived));
});

test("archived-only boards count as populated during initial sync", () => {
  const local = { ...board(), archivedCards: [task("done", "Finished")] };
  assert.equal(initialSyncAction(local, board(), null), "conflict");
});

test("merge keeps archived tasks from both devices without duplicating shared archives", () => {
  const local = { ...board([task("local", "Local")]), archivedCards: [task("shared", "Finished")] };
  const remote = { ...board([task("remote", "Remote")]), archivedCards: [task("shared", "Finished")] };
  const merged = mergeBoards(local, remote);

  assert.deepEqual(merged.archivedCards, remote.archivedCards);
  assert.ok(merged.cardsByCol.todo.some((card) => card.id === "local"));
  assert.ok(merged.cardsByCol.todo.some((card) => card.id === "remote"));
});
