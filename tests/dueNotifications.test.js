import test from "node:test";
import assert from "node:assert/strict";
import { allowedEndpoint, dueTasks, localClock, reminderPayload } from "../functions/reminder.js";

test("the local morning follows the subscriber's time zone and daylight savings", () => {
  assert.deepEqual(localClock(new Date("2026-09-29T15:00:00Z"), "America/Los_Angeles"), { date: "2026-09-29", hour: 8 });
  assert.deepEqual(localClock(new Date("2026-12-29T16:00:00Z"), "America/Los_Angeles"), { date: "2026-12-29", hour: 8 });
  assert.deepEqual(localClock(new Date("2026-09-29T15:00:00Z"), "Pacific/Auckland"), { date: "2026-09-30", hour: 4 });
  assert.equal(localClock(new Date(), "invalid zone"), null);
});

test("reminders cover today's unfinished tasks once in one summary", () => {
  const cards = dueTasks({ cardsByCol: {
    todo: [{ title: "Report", dueDate: "2026-09-29" }, { title: "Draft", dueDate: "2026-09-29", isDraft: true }],
    doing: [{ title: "Call", dueDate: "2026-09-29" }, { title: "Tomorrow", dueDate: "2026-09-30" }],
    done: [{ title: "Finished", dueDate: "2026-09-29" }],
  } }, "2026-09-29");
  assert.deepEqual(cards.map((card) => card.title), ["Report", "Call"]);
  assert.deepEqual(JSON.parse(reminderPayload(cards, "2026-09-29")), {
    type: "tasky-due", date: "2026-09-29", title: "2 tasks due today", body: "Report · Call",
  });
});

test("push endpoints cannot target arbitrary servers", () => {
  assert.equal(allowedEndpoint("https://web.push.apple.com/Qfoo"), true);
  assert.equal(allowedEndpoint("https://fcm.googleapis.com/fcm/send/foo"), true);
  assert.equal(allowedEndpoint("http://127.0.0.1/private"), false);
  assert.equal(allowedEndpoint("https://web.push.apple.com.evil.test/foo"), false);
});
