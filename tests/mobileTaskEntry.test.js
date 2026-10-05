import test, { before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

// Exercise the actual App and Card handlers, including the pointer -> blur ->
// click ordering that caused task loss on mobile. No Firebase account is used.
const dom = new JSDOM('<!doctype html><div id="root"></div>', {
  url: "http://localhost/", pretendToBeVisual: true,
});
for (const key of ["window", "document", "localStorage", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent"]) {
  globalThis[key] = key === "window" ? dom.window : dom.window[key];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = React;
let server, App, root;

before(async () => {
  server = await createServer({
    mode: "test", envPrefix: "TASKY_TEST_UNUSED_",
    server: { middlewareMode: true, hmr: false },
  });
  App = (await server.ssrLoadModule("/src/App.jsx")).default;
});
after(async () => { await server?.close(); dom.window.close(); });
beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem("tasky:pinned-controls", JSON.stringify(["stopwatch", "edit"]));
  root = createRoot(document.getElementById("root"));
  await act(async () => root.render(React.createElement(App)));
});
afterEach(async () => { await act(async () => root.unmount()); });

const input = () => document.querySelector('input[aria-label="Edit card title"]');
const cards = () => [...document.querySelectorAll("[data-card-id]")];
const button = (label, scope = document) => [...scope.querySelectorAll("button")]
  .find((node) => (node.getAttribute("aria-label") || node.textContent.trim()) === label);
const savedCards = () => Object.values(JSON.parse(localStorage.getItem("kanban-timer-board:v1")).cardsByCol).flat();
async function tap(node) {
  assert.ok(node, "tap target exists");
  // Browser default focus/blur happens between pointerdown and click, unless
  // the app prevents it to keep the action's target mounted until activation.
  let allowFocus;
  await act(async () => {
    allowFocus = node.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
    if (allowFocus) {
      node.focus();
      // Tapping nonfocusable page content dismisses the active mobile input.
      if (document.activeElement !== node && document.activeElement?.matches('input[aria-label="Edit card title"]')) {
        document.activeElement.blur();
      }
    }
  });
  let focusedDuringClick = false;
  let dispatchingClick = false;
  const focus = window.HTMLElement.prototype.focus;
  window.HTMLElement.prototype.focus = function (...args) {
    if (dispatchingClick && this.matches('input[aria-label="Edit card title"]')) focusedDuringClick = true;
    return focus.apply(this, args);
  };
  try {
    await act(async () => {
      dispatchingClick = true;
      try { node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); }
      finally { dispatchingClick = false; }
    });
  } finally {
    window.HTMLElement.prototype.focus = focus;
  }
  return focusedDuringClick;
}
async function type(value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function key(key, options = {}) {
  await act(async () => input().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options })));
}
async function add(value = "", column = "doing") {
  const focusedDuringClick = await tap(button("+Add task", document.querySelector(`[data-column-id="${column}"]`)));
  assert.equal(focusedDuringClick, true, "Add task focuses the new input during the tap");
  assert.equal(document.activeElement, input());
  if (value) await type(value);
}

for (const method of ["Return", "keyboard Done/blur", "Save"]) {
  test(`${method} saves exactly one named task without leaving a blank task behind`, async () => {
    await add("  Make breakfast  ");
    assert.equal(input().getAttribute("enterkeyhint"), "done");
    if (method === "Return") {
      await key("Enter");
      assert.equal(cards().length, 2, "Return opens the next draft");
      assert.equal(document.activeElement, input(), "next draft is focused for typing");
      assert.equal(input().value, "");
    }
    else if (method === "Save") await tap(button("Save"));
    else await act(async () => input().blur());
    await tap(document.querySelector("h1"));
    assert.equal(input(), null);
    assert.equal(cards().length, 1);
    assert.equal(savedCards()[0].title, "Make breakfast");
    assert.equal(savedCards()[0].isDraft, false);
  });
}
test("Return can add several tasks in sequence, then leaving removes only the empty draft", async () => {
  await add("First");
  await key("Enter");
  await type("Second");
  await key("Enter");
  assert.deepEqual(savedCards().map((card) => card.title), ["First", "Second"]);
  assert.equal(document.activeElement, input());
  await tap(document.querySelector("h1"));
  assert.deepEqual(savedCards().map((card) => card.title), ["First", "Second"]);
});
for (const [label, group, column] of [["Red", "g1", "todo"], ["Blue", "g2", "doing"], ["Yellow", "g3", "done"], ["without a group", null, "todo"]]) {
  test(`Add ${label} task focuses immediately and Return keeps its group in ${column}`, async () => {
    const scope = document.querySelector(`[data-column-id="${column}"]`);
    assert.equal(await tap(button("Add task group options", scope)), false);
    assert.equal(button("Add task group options", scope).getAttribute("aria-expanded"), "true");
    assert.deepEqual([...scope.querySelectorAll('[data-add-task-control] [id^="add-task-groups-"] button')].map((node) => node.textContent.trim()), ["No group", "Red", "Blue", "Yellow"]);
    assert.equal(await tap(button(group ? `Add ${label} task` : "Add task without a group", scope)), true);
    assert.equal(document.activeElement, input());
    assert.equal(savedCards().length, 0);
    await type("First");
    await key("Enter");
    assert.equal(document.activeElement, input());
    await type("Second");
    await key("Enter");
    assert.deepEqual(savedCards().map((card) => [card.title, card.group]), [["First", group], ["Second", group]]);
    await tap(document.querySelector("h1"));
    assert.deepEqual(savedCards().map((card) => [card.title, card.group]), [["First", group], ["Second", group]]);
  });
}
test("group menu opens below when it fits and above near the viewport bottom", async () => {
  const control = document.querySelector('[data-column-id="doing"] [data-add-task-control]');
  const originalRect = control.getBoundingClientRect;
  const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(window.Element.prototype, "scrollHeight");
  let bounds = { top: 80, bottom: 130 };
  control.getBoundingClientRect = () => bounds;
  Object.defineProperty(window.Element.prototype, "scrollHeight", {
    configurable: true,
    get() { return this.id?.startsWith("add-task-groups-") ? 180 : scrollHeightDescriptor?.get?.call(this) ?? 0; },
  });
  try {
    await tap(button("Add task group options", control));
    const menu = control.querySelector('[id^="add-task-groups-"]');
    assert.equal(menu.classList.contains("top-full"), true);
    bounds = { top: window.innerHeight - 90, bottom: window.innerHeight - 40 };
    await act(async () => window.dispatchEvent(new Event("resize")));
    assert.equal(menu.classList.contains("bottom-full"), true);
  } finally {
    control.getBoundingClientRect = originalRect;
    if (scrollHeightDescriptor) Object.defineProperty(window.Element.prototype, "scrollHeight", scrollHeightDescriptor);
    else delete window.Element.prototype.scrollHeight;
  }
});
test("Return follows a title group shortcut, including clearing the group", async () => {
  const scope = document.querySelector('[data-column-id="doing"]');
  await tap(button("Add task group options", scope));
  await tap(button("Add Red task", scope));
  await type("First g2");
  await key("Enter");
  assert.deepEqual(savedCards().map((card) => card.group), ["g2"]);
  await type("Second g0");
  await key("Enter");
  assert.deepEqual(savedCards().map((card) => card.group), ["g2", null]);
  await tap(document.querySelector("h1"));
  await add("Plain task");
  await tap(button("Save"));
  assert.equal(savedCards().at(-1).group, null);
});
test("Shift-click selects the full range from the last ordinary task click across columns", async () => {
  for (const [title, column] of [["First", "todo"], ["Middle", "doing"], ["Last", "done"]]) {
    await add(title, column);
    await tap(button("Save"));
  }
  const taskCard = (title) => cards().find((node) => node.textContent.includes(title));
  await act(async () => taskCard("First").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
  assert.equal(document.querySelector('[data-task-selection]'), null, "an ordinary click sets the anchor without selecting a task");
  await act(async () => taskCard("Last").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true })));
  assert.match(document.querySelector('[data-task-selection] [role="status"]').textContent, /3 selected/);
  assert.equal(taskCard("First").getAttribute("aria-label").includes(", selected"), true);
  assert.equal(taskCard("Middle").getAttribute("aria-label").includes(", selected"), true);
  assert.equal(taskCard("Last").getAttribute("aria-label").includes(", selected"), true);
});
for (const column of ["todo", "doing", "done"]) {
  test(`header + adds an ungrouped task at the top of ${column} and Return continues there`, async () => {
    await add("Earlier", column);
    await tap(button("Save"));
    const scope = document.querySelector(`[data-column-id="${column}"]`);
    assert.equal(await tap(button(`Add task at top of ${scope.querySelector("h2").textContent}`, scope)), true);
    assert.equal(document.activeElement, input());
    assert.equal(scope.querySelector("[data-card-id]"), input().closest("[data-card-id]"));
    assert.equal(savedCards().some((card) => card.isDraft), false, "the empty editor is never persisted");
    await type("Newest");
    await key("Enter");
    assert.equal(scope.querySelector("[data-card-id]"), input().closest("[data-card-id]"));
    await tap(document.querySelector("h1"));
    assert.deepEqual([...scope.querySelectorAll("[data-card-id]")].map((node) => node.textContent.includes("Newest") ? "Newest" : "Earlier"), ["Newest", "Earlier"]);
    assert.equal(savedCards().find((card) => card.title === "Newest").group, null);
    assert.equal(savedCards().some((card) => card.isDraft), false);
  });
}
for (const position of ["top", "bottom"]) {
  test(`${position} empty draft is discarded when the app is interrupted`, async () => {
    if (position === "bottom") await add();
    else {
      const scope = document.querySelector('[data-column-id="doing"]');
      await tap(button(`Add task at top of ${scope.querySelector("h2").textContent}`, scope));
    }
    assert.ok(input());
    assert.equal(savedCards().length, 0);
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    assert.equal(cards().length, 0);
    assert.equal(savedCards().length, 0);
  });
}

test("reopening after an abandoned draft does not restore an empty task", async () => {
  await add();
  assert.equal(savedCards().length, 0);
  await act(async () => root.unmount());
  root = createRoot(document.getElementById("root"));
  await act(async () => root.render(React.createElement(App)));
  assert.equal(cards().length, 0);
});

test("interruption commits a named draft", async () => {
  await add("Finish report");
  await act(async () => window.dispatchEvent(new Event("pagehide")));
  assert.equal(savedCards()[0].title, "Finish report");
  assert.equal(savedCards()[0].isDraft, false);
});
for (const method of ["Return", "blur", "stopwatch"]) {
  test(`whitespace-only draft + ${method} leaves no task`, async () => {
    await add("   ");
    assert.equal(button("Save").disabled, true);
    if (method === "Return") await key("Enter");
    else if (method === "stopwatch") await tap(button("Start stopwatch"));
    else await act(async () => input().blur());
    assert.equal(cards().length, 0);
    assert.equal(savedCards().length, 0);
  });
}
for (const column of ["todo", "doing"]) {
  test(`stopwatch tap saves draft in ${column} and starts it without losing the title`, async () => {
    await add("Read Bible", column);
    await tap(button("Start stopwatch"));
    assert.equal(cards().length, 1);
    assert.equal(document.querySelector('[data-column-id="doing"] [data-card-id]'), cards()[0]);
    const [card] = savedCards();
    assert.equal(card.title, "Read Bible");
    assert.equal(card.isDraft, false);
    assert.equal(card.stopwatch.running, true);
  });
}
test("Cancel and Escape discard typed drafts, even when blur follows", async () => {
  for (const method of ["Cancel", "Escape"]) {
    await add("Discard this");
    if (method === "Cancel") await tap(button("Cancel"));
    else await key("Escape");
    assert.equal(savedCards().length, 0);
  }
});
test("clearing an existing title preserves it; later edits still save", async () => {
  await add("Keep me");
  await key("Enter");
  await tap(document.querySelector("h1"));
  assert.equal(await tap(button("Keep me")), true, "title tap focuses the input immediately");
  assert.equal(document.activeElement, input());
  await type(" ");
  await key("Enter");
  assert.equal(savedCards()[0].title, "Keep me");
  await tap(button("Keep me"));
  await type("Renamed");
  await tap(button("Save"));
  assert.equal(savedCards()[0].title, "Renamed");
});
test("IME confirmation does not submit; final Return still does", async () => {
  await add("Composed title");
  await key("Enter", { isComposing: true });
  assert.ok(input());
  await key("Enter");
  assert.equal(savedCards()[0].title, "Composed title");
  assert.ok(input(), "the completed Return opens the next draft");
});
test("task options can be opened directly from a draft", async () => {
  await add("Open options");
  await tap(button("Options for task"));
  assert.ok(document.querySelector('[aria-label="Task options"]'));
  assert.equal(savedCards()[0].title, "Open options");
  assert.equal(savedCards()[0].isDraft, false);
});

test("pinned Edit opens with the just-saved draft title", async () => {
  await add("Edit this task");
  await tap(button("Edit task"));
  const modal = document.querySelector('[role="dialog"]');
  assert.ok(modal);
  assert.ok([...modal.querySelectorAll("input")].some((node) => node.value === "Edit this task"));
  assert.equal(savedCards()[0].title, "Edit this task");
});
test("saving a draft still applies duration and due-date shortcuts", async () => {
  await add("Study 25m due tomorrow");
  await tap(button("Save"));
  const [card] = savedCards();
  assert.equal(card.title, "Study");
  assert.equal(card.durationSec, 1500);
  assert.ok(card.dueDate);
  assert.equal(card.isDraft, false);
});
test("[] saves the task and focuses its subtask editor instead of opening another task", async () => {
  await add("Plan trip [] due tomorrow", "doing");
  const shortcut = document.querySelector('[data-title-shortcut][data-shortcut-label="Open subtask editor"]');
  assert.equal(shortcut?.textContent, "[]");
  await key("Enter");
  const [card] = savedCards().filter((item) => item.title === "Plan trip");
  assert.ok(card?.dueDate);
  assert.equal(card.isDraft, false);
  assert.equal(input(), null, "Enter does not open the next task draft");
  const subtaskInput = document.querySelector(`[data-card-id="${card.id}"] input[aria-label="New subtask"]`);
  assert.ok(subtaskInput);
  assert.equal(document.activeElement, subtaskInput);
});
test("[] also opens the subtask editor when renaming a saved task", async () => {
  await add("Plan trip");
  await tap(button("Save"));
  await tap(button("Plan trip"));
  await type("Plan trip []");
  await key("Enter");
  assert.equal(savedCards()[0].title, "Plan trip");
  assert.equal(document.activeElement?.getAttribute("aria-label"), "New subtask");
});
test("Save with [] opens the subtask editor without creating a blank task", async () => {
  await add("Plan trip []");
  await tap(button("Save"));
  assert.deepEqual(savedCards().map((card) => card.title), ["Plan trip"]);
  assert.equal(document.activeElement?.getAttribute("aria-label"), "New subtask");
});
test("subtask menu stopwatches add into the task total and pause on completion", async () => {
  await add("Project []", "todo");
  await key("Enter");
  const createSubtask = async (title) => {
    await act(async () => {
      const field = document.querySelector('input[aria-label="New subtask"]');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(field, title);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => document.querySelector('input[aria-label="New subtask"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
  };
  await createSubtask("Research");
  await createSubtask("Write");
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    await tap(button("Options for subtask Research"));
    const firstMenu = document.querySelector('[role="dialog"][aria-label="Options for subtask Research"]');
    assert.deepEqual([...firstMenu.querySelectorAll("button")].map((item) => item.textContent), ["Edit subtask", "Delete subtask"]);
    await tap(button("Start subtask Research stopwatch", document.querySelector('[data-subtask-id]')));
    assert.equal(savedCards()[0].subtasks[0].stopwatch.running, true);
    assert.ok(document.querySelector('[data-column-id="doing"] [data-card-title]'), "starting a subtask clock moves a To Do task to Doing");
    assert.equal([...document.querySelectorAll('[data-card-id] button[aria-label="Pause stopwatch"]')].length, 1, "one task stopwatch controls the linked total");
    now += 5000;
    await tap(button("Pause subtask Research stopwatch", document.querySelector('[data-subtask-id]')));
    assert.equal(savedCards()[0].subtasks[0].stopwatch.elapsedSec, 5);
    await tap(button("Start subtask Write stopwatch", [...document.querySelectorAll('[data-subtask-id]')][1]));
    now += 3000;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 120)); });
    assert.equal(button("Edit elapsed time, 0:08").textContent, "0:08");
    await tap(button("Pause stopwatch", document.querySelector('[data-card-id]')));
    assert.equal(savedCards()[0].subtasks[1].stopwatch.running, false);
    assert.equal(savedCards()[0].subtasks[0].stopwatch.elapsedSec, 5);
    await tap(button("Resume stopwatch", document.querySelector('[data-card-id]')));
    assert.equal(savedCards()[0].stopwatch.running, true);
    assert.ok(savedCards()[0].subtasks.every((subtask) => !subtask.stopwatch.running));
    now += 2000;
    await tap(button("Pause stopwatch", document.querySelector('[data-card-id]')));
    assert.equal(savedCards()[0].subtasks[0].stopwatch.elapsedSec, 5);
    assert.equal(savedCards()[0].subtasks[1].stopwatch.elapsedSec, 3);
    await tap(button("Edit elapsed time, 0:10"));
    await act(async () => {
      const field = document.querySelector('input[aria-label="Edit elapsed time"]');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(field, "0:20");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => document.querySelector('input[aria-label="Edit elapsed time"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    assert.equal(savedCards()[0].stopwatch.elapsedSec + savedCards()[0].subtasks.reduce((sum, subtask) => sum + subtask.stopwatch.elapsedSec, 0), 20);
    await tap(button("Edit elapsed time, 0:20"));
    await act(async () => {
      const field = document.querySelector('input[aria-label="Edit elapsed time"]');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(field, "0:06");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => document.querySelector('input[aria-label="Edit elapsed time"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    assert.equal(savedCards()[0].subtasks.reduce((sum, subtask) => sum + subtask.stopwatch.elapsedSec, 0), 6);
    await tap(button("Reset stopwatch", document.querySelector('[data-card-id]')));
    assert.ok(savedCards()[0].subtasks.every((subtask) => subtask.stopwatch.elapsedSec === 0 && !subtask.stopwatch.running));
    await tap(button("Resume subtask Write stopwatch", [...document.querySelectorAll('[data-subtask-id]')][1]));
    now += 3000;
    await tap(button("Options for Project"));
    await tap(button("Move to"));
    await tap(button("Move to Done"));
    const saved = savedCards().find((card) => card.title === "Project");
    assert.equal(saved.subtasks[1].stopwatch.running, false);
    assert.equal(saved.subtasks[1].stopwatch.elapsedSec, 3);
  } finally {
    Date.now = realNow;
  }
});
test("subtask menu edits and deletes the selected subtask", async () => {
  await add("Project []");
  await key("Enter");
  await act(async () => {
    const field = document.querySelector('input[aria-label="New subtask"]');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(field, "Draft");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => document.querySelector('input[aria-label="New subtask"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
  await tap(button("Start subtask Draft stopwatch", document.querySelector('[data-subtask-id]')));
  const row = document.querySelector('[data-subtask-id]');
  await tap([...row.querySelectorAll('button[aria-label]')].find((item) => item.getAttribute("aria-label").startsWith("subtask Draft elapsed time")));
  await act(async () => {
    const field = document.querySelector('input[aria-label="Edit subtask Draft elapsed time"]');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(field, "1:30");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => document.querySelector('input[aria-label="Edit subtask Draft elapsed time"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
  assert.equal(savedCards()[0].subtasks[0].stopwatch.elapsedSec, 90);
  await tap(button("Reset subtask Draft stopwatch", row));
  assert.equal(savedCards()[0].subtasks[0].stopwatch.elapsedSec, 0);
  await tap(button("Remove subtask Draft stopwatch", row));
  assert.equal(savedCards()[0].subtasks[0].stopwatch, null);
  assert.ok(button("Remove stopwatch", document.querySelector('[data-card-id]')), "the task stopwatch remains after removing the subtask clock");
  await tap(button("Options for subtask Draft"));
  await tap(button("Edit subtask", document.querySelector('[role="dialog"][aria-label="Options for subtask Draft"]')));
  const editField = document.querySelector('input[aria-label="Edit subtask"]');
  assert.equal(document.activeElement, editField);
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(editField, "Revised");
    editField.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => editField.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
  assert.equal(savedCards()[0].subtasks[0].title, "Revised");
  await tap(button("Options for subtask Revised"));
  await tap(button("Delete subtask", document.querySelector('[role="dialog"][aria-label="Options for subtask Revised"]')));
  assert.deepEqual(savedCards()[0].subtasks, []);
});
test("starting a subtask clock carries existing task stopwatch time into the linked total", async () => {
  await add("Project []");
  await key("Enter");
  await act(async () => {
    const field = document.querySelector('input[aria-label="New subtask"]');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(field, "Research");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => document.querySelector('input[aria-label="New subtask"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    await tap(button("Start stopwatch", document.querySelector('[data-card-id]')));
    now += 10000;
    await tap(button("Start subtask Research stopwatch", document.querySelector('[data-subtask-id]')));
    const card = savedCards()[0];
    assert.equal(card.stopwatch.elapsedSec, 10);
    assert.equal(card.stopwatch.running, false);
    assert.equal(card.subtasks[0].stopwatch.elapsedSec, 0);
    await tap(button("Pause stopwatch", document.querySelector('[data-card-id]')));
    assert.equal(savedCards()[0].subtasks[0].stopwatch.elapsedSec, 0);
    assert.equal(savedCards()[0].stopwatch.elapsedSec, 10);
  } finally {
    Date.now = realNow;
  }
});
test("settings toggle moves the subtask start button between the row and menu", async () => {
  await add("Project []");
  await key("Enter");
  await act(async () => {
    const field = document.querySelector('input[aria-label="New subtask"]');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(field, "Research");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => document.querySelector('input[aria-label="New subtask"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
  assert.ok(button("Start subtask Research stopwatch", document.querySelector('[data-subtask-id]')));
  await tap(document.querySelector('button[title="Settings"]'));
  const checkbox = [...document.querySelectorAll('[role="dialog"][aria-label="Settings"] label')].find((label) => label.textContent.includes("Show subtask stopwatch button")).querySelector('input[type="checkbox"]');
  assert.equal(checkbox.checked, true);
  await tap(checkbox);
  assert.equal(localStorage.getItem("tasky:subtask-stopwatch-button"), "false");
  await tap(document.querySelector('[role="dialog"][aria-label="Settings"] button'));
  assert.equal(button("Start subtask Research stopwatch", document.querySelector('[data-subtask-id]')), undefined);
  await tap(button("Options for subtask Research"));
  await tap(button("Start stopwatch", document.querySelector('[role="dialog"][aria-label="Options for subtask Research"]')));
  assert.ok(button("Pause subtask Research stopwatch", document.querySelector('[data-subtask-id]')), "active controls stay visible when the shortcut is off");
});
test("title shortcuts highlight the exact text and show the saved values on hover", async () => {
  await add("Study 25m g2 due tomorrow at 11am");
  const shortcuts = [...document.querySelectorAll("[data-title-shortcut]")];
  assert.deepEqual(shortcuts.map((node) => node.textContent), ["25m", "g2", "due tomorrow at 11am"]);
  assert.equal(shortcuts[0].dataset.shortcutLabel, "Timer: 25 min");
  assert.equal(shortcuts[1].dataset.shortcutLabel, "Group: Blue");
  assert.match(shortcuts[2].dataset.shortcutLabel, /^Due .* at 11:00 AM$/);
  shortcuts[0].getBoundingClientRect = () => ({ left: 5, right: 30, top: 5, bottom: 25 });
  await act(async () => input().dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 10, clientY: 10 })));
  assert.equal(document.querySelector('[role="tooltip"]').textContent, "Timer: 25 min");
  await key("Enter");
  assert.equal(savedCards()[0].title, "Study");
  assert.equal(savedCards()[0].durationSec, 1500);
  assert.equal(savedCards()[0].dueTime, "11:00");
  await type("Next task");
  await tap(button("Save"));
  assert.equal(savedCards()[1].group, "g2");
});
test("preview keeps character positions after a due phrase and explains segmented timers", async () => {
  await add("Study due tomorrow 25m/5m g1");
  const shortcuts = [...document.querySelectorAll("[data-title-shortcut]")];
  assert.deepEqual(shortcuts.map((node) => node.textContent), ["due tomorrow", "25m", "5m", "g1"]);
  assert.equal(shortcuts[1].dataset.shortcutLabel, "Timer: 25 min + 5 min (2 segments)");
  await act(async () => { input().scrollLeft = 120; input().dispatchEvent(new Event("scroll", { bubbles: true })); });
  assert.equal(shortcuts[0].parentElement.style.transform, "translateX(-120px)");
  await tap(button("Save"));
  assert.equal(savedCards()[0].segments.length, 2);
});
test("invalid date text is not highlighted and deleting shortcuts removes the preview", async () => {
  await add("Report due Sept 31");
  assert.equal(document.querySelector("[data-title-shortcut]"), null);
  await type("Report 25m due clear g0");
  assert.deepEqual([...document.querySelectorAll("[data-title-shortcut]")].map((node) => node.dataset.shortcutLabel), ["Timer: 25 min", "Remove due date", "Group: No group"]);
  await type("Report");
  assert.equal(document.querySelector("[data-title-shortcut]"), null);
  assert.equal(document.querySelector('[role="status"]'), null);
});
test("natural weekday and time in a new task become a due date", async () => {
  await add("Meeting with Client Wednesday at 11am");
  await tap(button("Save"));
  const [card] = savedCards();
  assert.equal(card.title, "Meeting with Client");
  assert.equal(card.dueTime, "11:00");
  assert.equal(card.dueTimeExplicit, true);
  assert.ok(card.dueDate);
  assert.equal(card.durationSec, 0);
});
test("flagging a task places it at the top of its current column", async () => {
  await add("First");
  await tap(button("Save"));
  await add("Priority");
  await tap(button("Save"));
  const priorityCard = [...document.querySelectorAll('[data-column-id="doing"] [data-card-id]')]
    .find((node) => node.textContent.includes("Priority"));
  await tap(button("Options for Priority", priorityCard));
  await tap(button("Flag as important", priorityCard));
  const titles = [...document.querySelectorAll('[data-column-id="doing"] [data-card-id]')]
    .map((node) => node.querySelector('[data-card-title]')?.textContent);
  assert.deepEqual(titles, ["Priority", "First"]);
});

test("daily activity records unfinished overlapping tasks, corrections, deletion, and completion", async () => {
  const realNow = Date.now;
  let now = new Date(2026, 9, 4, 9).getTime();
  Date.now = () => now;
  const closeArchive = async () => act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  try {
    await add("Research");
    await tap(button("Save"));
    await tap(button("Start stopwatch", cards()[0]));
    now += 3600000;
    await add("Writing");
    await tap(button("Save"));
    await tap(button("Start stopwatch", cards()[1]));
    now += 3600000;
    await tap(button("Pause stopwatch", cards()[0]));
    now += 3600000;
    await tap(button("Pause stopwatch", cards()[1]));
    await tap(button("View archive"));
    assert.equal(document.querySelector('[data-testid="daily-work-total"]').textContent, "3h 0m");
    assert.equal(document.querySelectorAll('section[aria-label="Daily activity"] article').length, 2);
    const session = [...document.querySelectorAll('section[aria-label="Daily activity"] button')].find((node) => node.getAttribute("aria-label")?.startsWith("Research:"));
    await tap(session);
    assert.match(document.querySelector('section[aria-label="Daily activity"] [role="status"]').textContent, /Research:.*2h 0m/);
    await closeArchive();
    await tap(button("Edit elapsed time, 2:00:00", cards()[1]));
    await act(async () => {
      const field = document.querySelector('input[aria-label="Edit elapsed time"]');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(field, "0:30:00");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => document.querySelector('input[aria-label="Edit elapsed time"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    await tap(button("View archive"));
    assert.equal(document.querySelector('[data-testid="daily-work-total"]').textContent, "2h 0m", "Writing's remaining 30 minutes overlap Research");
    await closeArchive();
    await tap(button("Options for Writing"));
    await tap(button("Delete task"));
    await tap(button("Options for Research"));
    await tap(button("Move to"));
    await tap(button("Move to Done"));
    await tap(document.querySelector('summary[aria-label="Archive options"]'));
    await tap(button("Archive completed tasks"));
    await tap(button("View archive"));
    assert.equal(document.querySelector('[data-testid="daily-work-total"]').textContent, "2h 0m");
    assert.match(document.querySelector('section[aria-label="Daily activity"]').textContent, /Deleted task/);
    await tap(button("Completed tasks (1)"));
    assert.match(document.querySelector('[role="dialog"]').textContent, /Research/);
    assert.doesNotMatch(document.querySelector('[role="dialog"]').textContent, /Writing/);
    const stored = JSON.parse(localStorage.getItem("kanban-timer-board:v1"));
    assert.equal(stored.archivedCards.length, 2);
    assert.equal(stored.archivedCards.filter((card) => !card.activityOnly).length, 1);
    await act(async () => root.unmount());
    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(React.createElement(App)));
    await tap(button("View archive"));
    assert.equal(document.querySelector('[data-testid="daily-work-total"]').textContent, "2h 0m", "history survives reload");
  } finally { Date.now = realNow; }
});


test("manually setting a Done task stopwatch logs past work and preserves completed totals", async () => {
  const realNow = Date.now;
  const now = new Date(2026, 9, 4, 11, 30).getTime();
  Date.now = () => now;
  try {
    await add("Read Bible", "done");
    await tap(button("Save"));
    await tap(button("Start stopwatch", cards()[0]));
    await tap(button("Pause stopwatch", cards()[0]));
    await tap(button("Edit elapsed time, 0:00", cards()[0]));
    await act(async () => {
      const field = document.querySelector('input[aria-label="Edit elapsed time"]');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(field, "10:00");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => document.querySelector('input[aria-label="Edit elapsed time"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    assert.deepEqual(savedCards()[0].workLog.sessions, [{ clock: "main", start: now - 600000, end: now }]);
    await tap(document.querySelector('summary[aria-label="Archive options"]'));
    await tap(button("Archive completed tasks"));
    await tap(button("View archive"));
    assert.equal(document.querySelector('[data-testid="daily-work-total"]').textContent, "10m");
    assert.match(document.querySelector('section[aria-label="Daily activity"]').textContent, /Read Bible/);
    await tap(button("Completed tasks (1)"));
    assert.match(document.querySelector('[role="dialog"]').textContent, /10:00 total task time/);
  } finally { Date.now = realNow; }
});

test("Doing drop toggle persists and starts a new stopwatch with activity history", async () => {
  const realNow = Date.now;
  const now = new Date(2026, 9, 5, 9).getTime();
  Date.now = () => now;
  const drop = async (id, fromCol, toCol) => {
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { types: ["application/x-card"], getData: () => JSON.stringify({ cardId: id, fromCol }) } });
    await act(async () => document.querySelector(`[data-column-id="${toCol}"]`).dispatchEvent(event));
  };
  try {
    await add("Reading", "todo");
    await tap(button("Save"));
    const id = savedCards()[0].id;
    await drop(id, "todo", "doing");
    assert.ok(!savedCards()[0].stopwatch, "off by default");
    await drop(id, "doing", "todo");
    await tap(document.querySelector('button[title="Settings"]'));
    const checkbox = [...document.querySelectorAll('[aria-label="Settings"] label')]
      .find((label) => label.textContent.includes("Start unstarted stopwatches")).querySelector("input");
    await tap(checkbox);
    assert.equal(localStorage.getItem("tasky:auto-start-stopwatch-on-drop"), "true");
    await tap(button("Close"));
    await act(async () => root.unmount());
    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(React.createElement(App)));
    await drop(id, "todo", "doing");
    assert.equal(savedCards()[0].stopwatch.running, true);
    assert.equal(savedCards()[0].stopwatch.lastStartTs, now);
    assert.deepEqual(savedCards()[0].workLog.sessions, [{ clock: "main", start: now, end: null }]);
    await drop(id, "doing", "doing");
    assert.equal(savedCards()[0].workLog.sessions.length, 1);
  } finally { Date.now = realNow; }
});
