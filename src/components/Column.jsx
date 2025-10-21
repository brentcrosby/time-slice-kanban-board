import React from "react";
import { secsToHHMM } from "../utils/time";

export function Column({ column, cards, onDropCard, onAddCard, renderCard, palette }) {
  const handleDragOver = (event) => {
    event.preventDefault();
    event.currentTarget.classList.add("ring", "ring-neutral-700");
  };

  const handleDragLeave = (event) => {
    event.currentTarget.classList.remove("ring", "ring-neutral-700");
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.currentTarget.classList.remove("ring", "ring-neutral-700");
    const payload = JSON.parse(event.dataTransfer.getData("application/x-card"));
    const list = event.currentTarget.querySelector("[data-list]");
    const children = Array.from(list.children);
    let insertIndex = children.length;
    const y = event.clientY;
    for (let i = 0; i < children.length; i += 1) {
      const rect = children[i].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        insertIndex = i;
        break;
      }
    }
    onDropCard(payload.cardId, payload.fromCol, insertIndex);
  };

  const totalSecs = (cards || []).reduce((acc, c) => acc + (c?.durationSec || 0), 0);

  return (
    <section
      className="flex flex-col gap-3 rounded-2xl border p-4 shadow-sm transition-shadow"
      style={{ backgroundColor: palette.surface, borderColor: palette.border }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="flex items-center">
        <h2 className="text-sm font-semibold tracking-tight flex items-center" style={{ color: palette.text }}>
          {column.name}
          <span
            className="ml-2 rounded-full px-2 py-0.5 text-xs"
            style={{ backgroundColor: palette.badge, color: palette.subtext }}
          >
            {cards.length}
          </span>
          <span
            className="ml-2 rounded-full px-2 py-0.5 text-xs tabular-nums"
            title="Total planned time"
            style={{ backgroundColor: palette.badge, color: palette.text }}
          >
            {secsToHHMM(totalSecs)}
          </span>
        </h2>
      </header>
      <div data-list className="flex flex-col gap-3">
        {cards.map((card, index) => renderCard(card, index))}
      </div>
      <button
        type="button"
        onClick={onAddCard}
        className="flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition"
        style={{ backgroundColor: palette.card, borderColor: palette.border, color: palette.subtext }}
      >
        <span className="text-lg leading-none">+</span>
        <span>Add card</span>
      </button>
    </section>
  );
}
