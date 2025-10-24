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
