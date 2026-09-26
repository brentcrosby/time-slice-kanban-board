import React from "react";
import { Modal } from "./Modal";
import { CARD_GROUP_ORDER, CARD_GROUPS } from "../constants/groups";

export function HelpModal({ onClose, palette }) {
  const groups = CARD_GROUP_ORDER.map((groupId) => ({
    id: groupId,
    label: CARD_GROUPS[groupId]?.label,
  }));

  return (
    <Modal title="Shorthand Reference" onClose={onClose} palette={palette}>
      <div className="space-y-4 text-sm" style={{ color: palette.text }}>
        <section className="space-y-2">
          <h4 className="text-sm font-semibold">Task options and priority</h4>
          <p style={{ color: palette.subtext }}>Open a card’s three-dot menu to edit or delete it, or enable a timer, stopwatch, subtasks, or priority flag. Once enabled, a feature’s controls appear directly on the card, even when its clock is paused. Flagged tasks show an amber flag and edge accent; click the flag to remove it.</p>
        </section>
        <section className="space-y-2">
          <h4 className="text-sm font-semibold">Select and organize tasks</h4>
          <p style={{ color: palette.subtext }}>Cmd/Ctrl-click toggles a task; Shift-click selects a range in board order (Do, Doing, Done). You can also choose Select task in the card menu, then use the selection checkboxes. Drag a selected task to move the entire selection.</p>
          <p style={{ color: palette.subtext }}>Use the selection toolbar to move, duplicate, flag, or delete tasks. Cmd/Ctrl+A selects all tasks, C copies, X cuts, and V pastes into the chosen column. Task copies stay in Tasky’s clipboard until you reload or press Escape. Cut tasks are moved only when pasted. Delete asks for confirmation, and Cmd/Ctrl+Z undoes changes.</p>
        </section>
        <section className="space-y-2">
          <h4 className="text-sm font-semibold">Completion dates</h4>
          <p style={{ color: palette.subtext }}>Moving a task into Done records its completion date. Archiving preserves that date and records when it was archived. Moving it back to Do or Doing clears its completion date until it is completed again. Older tasks without a recorded date are labeled accordingly.</p>
        </section>
        <section className="space-y-2">
          <h4 className="text-sm font-semibold" style={{ color: palette.text }}>
            Optional timers
          </h4>
          <p className="text-sm" style={{ color: palette.subtext }}>
            Tasks start without a timer to keep the board compact. Choose Add timer in a card’s three-dot menu to add a
            time limit; its progress bar and controls appear on the card after you set one. You can also add a timer
            with a time shorthand in the task title.
          </p>
        </section>

        <section className="space-y-2">
          <h4 className="text-sm font-semibold" style={{ color: palette.text }}>
            Stopwatch
          </h4>
          <p className="text-sm" style={{ color: palette.subtext }}>
            Choose Start stopwatch in a timerless task’s three-dot menu. Its elapsed time, pause/resume, reset, and remove controls appear beside the menu. Click the elapsed time to edit it. A stopwatch counts up independently and does not show a progress bar
            or add to planned-time totals.
          </p>
        </section>

        <section className="space-y-2">
          <h4 className="text-sm font-semibold" style={{ color: palette.text }}>
            Time shorthands
          </h4>
          <p className="text-sm" style={{ color: palette.subtext }}>
            Add these patterns to a card title to auto-fill duration and segments. The detected text is
            removed from the saved title.
          </p>
          <ul className="list-disc space-y-1 pl-5" style={{ color: palette.subtext }}>
            <li>
              Use minute or hour units like <code>25m</code>, <code>45min</code>, <code>1h</code>, or{" "}
              <code>1.5h</code>.
            </li>
            <li>
              Combine hours and minutes such as <code>1h 30m</code> or <code>2 hours 15 minutes</code>.
            </li>
            <li>
              Enter clock-style times: <code>12:30</code> (minutes:seconds) or <code>1:05:00</code>{" "}
              (hours:minutes:seconds).
            </li>
            <li>
              List multiple durations to build segments, e.g. <code>Deep work 25m 5m 25m</code> makes three
              segments.
            </li>
            <li>
              Insert a <code>/</code> between durations to force a new segment, such as <code>1h 15m / 30m</code> or{" "}
              <code>25m/25m</code>.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h4 className="text-sm font-semibold" style={{ color: palette.text }}>
            Subtasks
          </h4>
          <p className="text-sm" style={{ color: palette.subtext }}>
            Choose Add subtasks in a card’s three-dot menu to add its first subtask. Press Enter to save each checklist item
            and start the next; click away to finish. Once a card has subtasks, its checklist stays visible.
            Use the grip to drag items into a new order, or focus it and press Alt+Up/Down. Click an item
            to rename it, and check it off when complete.
          </p>
        </section>

        <section className="space-y-2">
          <h4 className="text-sm font-semibold" style={{ color: palette.text }}>
            Group shorthands
          </h4>
          <p className="text-sm" style={{ color: palette.subtext }}>
            Include a group token to set the card color without opening the editor. Tokens are removed from
            the final title.
          </p>
          <ul className="list-disc space-y-1 pl-5" style={{ color: palette.subtext }}>
            {groups.map((group) => (
              <li key={group.id}>
                <code>{group.id}</code> → {group.label}
              </li>
            ))}
            <li>
              <code>g0</code> clears any existing group assignment.
            </li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
