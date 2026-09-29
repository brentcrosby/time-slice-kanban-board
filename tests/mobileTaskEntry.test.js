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
