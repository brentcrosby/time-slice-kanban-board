import test from "node:test";
import assert from "node:assert/strict";
import { summarizeGroupTasks } from "../src/utils/groupChips.js";

const groups = ["g1", "g2", "g3"];

test("shows a group with only timerless tasks", () => {
  assert.deepEqual(
    summarizeGroupTasks([{ group: "g1", durationSec: 0 }, { group: "g1" }], groups),
    [{ id: "g1", totalSeconds: 0, untimedCount: 2 }]
  );
});

test("keeps timed totals and untimed counts together in group order", () => {
  assert.deepEqual(
    summarizeGroupTasks([
      { group: "g2", durationSec: 1500 },
      { group: "g1", durationSec: 0 },
      { group: "g2", durationSec: 0 },
      { group: "g2", durationSec: 300 },
      { group: null, durationSec: 0 },
    ], groups),
    [
      { id: "g1", totalSeconds: 0, untimedCount: 1 },
      { id: "g2", totalSeconds: 1800, untimedCount: 1 },
    ]
  );
});
