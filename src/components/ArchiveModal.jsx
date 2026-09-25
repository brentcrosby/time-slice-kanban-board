import React from "react";
import { ArchiveRestore, CheckSquare, Clock3, RotateCcw } from "lucide-react";
import { Modal } from "./Modal";
import { CARD_GROUPS } from "../constants/groups";

const formatStopwatch = (seconds) => {
  const total = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
};

function ArchivedTask({ card, onRestore, palette, isDark }) {
  const groupColors = card.group
    ? CARD_GROUPS[card.group]?.colors?.[isDark ? "dark" : "light"]
    : null;
  const subtasks = card.subtasks || [];
  const completedSubtasks = subtasks.filter((subtask) => subtask.completed).length;

  return (
    <article
      className="flex items-start gap-3 rounded-xl border p-3 shadow-sm"
      style={{
        backgroundColor: groupColors?.cardBg || palette.card,
        borderColor: groupColors?.cardBorder || palette.border,
      }}
    >
      <div className="min-w-0 flex-1">
        <h4 className="break-words text-sm font-semibold" style={{ color: groupColors?.cardText || palette.text }}>
          {card.title || "Untitled"}
        </h4>
        {card.notes ? (
          <p className="mt-1 whitespace-pre-wrap break-words text-xs" style={{ color: groupColors?.cardSubtext || palette.subtext }}>
            {card.notes}
          </p>
        ) : null}
        {(subtasks.length > 0 || card.durationSec > 0 || card.stopwatch) ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: groupColors?.cardSubtext || palette.subtext }}>
            {subtasks.length > 0 ? (
              <span className="inline-flex items-center gap-1">
                <CheckSquare className="h-3.5 w-3.5" />
                {completedSubtasks}/{subtasks.length}
              </span>
            ) : null}
            {card.durationSec > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5" />
                {formatStopwatch(card.durationSec)} planned
              </span>
            ) : null}
            {card.stopwatch ? (
              <span className="inline-flex items-center gap-1">
                <RotateCcw className="h-3.5 w-3.5" />
                {formatStopwatch(card.stopwatch.elapsedSec)} tracked
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onRestore}
        title={`Restore ${card.title || "task"} to Done`}
        aria-label={`Restore ${card.title || "task"} to Done`}
        className="interactive-button flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
        style={{ borderColor: palette.border, color: palette.text }}
      >
        <ArchiveRestore className="h-4 w-4" />
        <span>Restore</span>
      </button>
    </article>
  );
}

export function ArchiveModal({ archivedCards, onRestore, onClose, palette, isDark }) {
  return (
    <Modal title={`Archived tasks (${archivedCards.length})`} onClose={onClose} palette={palette}>
      {archivedCards.length ? (
        <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
          {archivedCards.map((card) => (
            <ArchivedTask
              key={card.id}
              card={card}
              onRestore={() => onRestore(card.id)}
              palette={palette}
              isDark={isDark}
            />
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-sm" style={{ color: palette.subtext }}>
          Archived tasks will appear here.
        </p>
      )}
    </Modal>
  );
}
