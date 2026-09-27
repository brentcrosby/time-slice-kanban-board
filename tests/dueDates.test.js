import test from "node:test";
import assert from "node:assert/strict";
import { applyDueDate, extractDueShortcut, flagDueTasks, formatDueDate, setManualFlag } from "../src/utils/dueDates.js";
import { boardFingerprint, mergeBoards } from "../src/utils/boardSync.js";

const now = new Date(2026, 8, 26, 10);

test("relative due shortcuts remove only the date phrase and default to 11:59 PM", () => {
  for (const token of ["tomorrow", "tmrw", "tmr"]) {
    const parsed = extractDueShortcut(`HW Assignment due ${token}`, now);
    assert.equal(parsed.cleanTitle, "HW Assignment");
    assert.equal(parsed.dueDate, "2026-09-27");
    assert.equal(parsed.dueTime, "23:59");
    assert.equal(parsed.dueTimeExplicit, false);
  }
  assert.equal(extractDueShortcut("Read due in 3 days", now).dueDate, "2026-09-29");
});

test("named, numeric, weekday and explicit time shortcuts parse without consuming other title content", () => {
  const parsed = extractDueShortcut("HW Assignment g2 25m due Sept 29 at 5pm", now);
  assert.equal(parsed.cleanTitle.trim(), "HW Assignment g2 25m");
  assert.equal(parsed.dueDate, "2026-09-29");
  assert.equal(parsed.dueTime, "17:00");
  assert.equal(parsed.dueTimeExplicit, true);
  assert.equal(extractDueShortcut("Call due 9/29 at 5:30pm", now).dueTime, "17:30");
  assert.equal(extractDueShortcut("Call due 2026-09-29 at 17:00", now).dueDate, "2026-09-29");
  assert.equal(extractDueShortcut("Call due next Monday", now).dueDate, "2026-09-28");
  assert.equal(extractDueShortcut("Call due Friday", now).dueDate, "2026-10-02");
  assert.equal(extractDueShortcut("File due Feb 29", now).dueDate, "2028-02-29");
});

test("invalid dates stay in title, and a clear shortcut removes a due date", () => {
  assert.equal(extractDueShortcut("Send due Sept 31", now).dueFound, false);
  assert.equal(extractDueShortcut("Send due clear", now).dueDate, null);
  assert.equal(extractDueShortcut("Send due clear", now).cleanTitle.trim(), "Send");
});

test("automatic flags trigger once on due day and respect later manual changes", () => {
  const task = { id: "a", flagged: false, dueDate: "2026-09-27", dueTime: "23:59" };
  const board = { todo: [task], doing: [], done: [] };
  assert.equal(flagDueTasks(board, "2026-09-26"), board);
  const due = flagDueTasks(board, "2026-09-27");
  assert.equal(due.todo[0].flagged, true);
  assert.equal(due.todo[0].autoFlaggedDueDate, "2026-09-27");
  const dismissed = { ...due, todo: [setManualFlag(due.todo[0], false, "2026-09-27")] };
  assert.equal(flagDueTasks(dismissed, "2026-09-28"), dismissed);
  assert.equal(applyDueDate(due.todo[0], null).flagged, false);
  assert.equal(applyDueDate({ flagged: true }, "2026-10-01").flagged, true);
  const manual = { ...task, flagged: true };
  assert.equal(applyDueDate(flagDueTasks({ ...board, todo: [manual] }, "2026-09-27").todo[0], null).flagged, true);
});

test("due dates format independently of the browser time zone", () => {
  assert.match(formatDueDate({ dueDate: "2026-09-29", dueTime: "17:00" }, now), /Sep 29.*5:00\s?PM/i);
});

test("due dates and automatic flag metadata persist in synced board state", () => {
  const task = { id: "due", title: "HW", dueDate: "2026-09-29", dueTime: "17:00", dueTimeExplicit: true, flagged: true, dueReminderHandledDate: "2026-09-29" };
  const local = { cardsByCol: { todo: [task], doing: [], done: [] }, archivedCards: [] };
  const remote = { cardsByCol: { todo: [], doing: [], done: [] }, archivedCards: [] };
  assert.notEqual(boardFingerprint(local), boardFingerprint(remote));
  assert.deepEqual(mergeBoards(local, remote).cardsByCol.todo, [task]);
});
