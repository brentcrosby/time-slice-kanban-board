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
  assert.deepEqual(savedCards().map((card) => card.title), ["First", "Second", ""]);
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
    assert.equal(savedCards()[0].group, group);
    await type("First");
    await key("Enter");
    assert.equal(document.activeElement, input());
    await type("Second");
    await key("Enter");
    assert.deepEqual(savedCards().map((card) => [card.title, card.group]), [["First", group], ["Second", group], ["", group]]);
    await tap(document.querySelector("h1"));
    assert.deepEqual(savedCards().map((card) => [card.title, card.group]), [["First", group], ["Second", group]]);
  });
}
test("Return follows a title group shortcut, including clearing the group", async () => {
  const scope = document.querySelector('[data-column-id="doing"]');
  await tap(button("Add task group options", scope));
  await tap(button("Add Red task", scope));
  await type("First g2");
  await key("Enter");
  assert.deepEqual(savedCards().map((card) => card.group), ["g2", "g2"]);
  await type("Second g0");
  await key("Enter");
  assert.deepEqual(savedCards().map((card) => card.group), ["g2", null, null]);
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
    assert.equal(savedCards().find((card) => card.isDraft).group, null);
    await type("Newest");
    await key("Enter");
    assert.equal(scope.querySelector("[data-card-id]"), input().closest("[data-card-id]"));
    await tap(document.querySelector("h1"));
    assert.deepEqual([...scope.querySelectorAll("[data-card-id]")].map((node) => node.textContent.includes("Newest") ? "Newest" : "Earlier"), ["Newest", "Earlier"]);
    assert.equal(savedCards().find((card) => card.title === "Newest").group, null);
    assert.equal(savedCards().some((card) => card.isDraft), false);
  });
}
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
