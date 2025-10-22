import React, { useState } from "react";
import { secsToHHMM } from "../utils/time";
import { CARD_GROUP_ORDER, CARD_GROUPS } from "../constants/groups";

export function Column({
  column,
  cards,
  totalCount,
  onDropCard,
  onAddCard,
  onClearColumn,
  renderCard,
  palette,
  isDark = false,
}) {
  const [dropIndex, setDropIndex] = useState(null);
  const cardCount = totalCount != null ? totalCount : cards.length;
  const hasCards = cardCount > 0;

  const findInsertIndex = (event) => {
    const list = event.currentTarget.querySelector("[data-list]");
    if (!list) return null;
    const items = Array.from(list.querySelectorAll("[data-card-id]"));
    const y = event.clientY;
    let insertIndex = items.length;
    for (let i = 0; i < items.length; i += 1) {
      const rect = items[i].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        insertIndex = i;
        break;
      }
    }
    return insertIndex;
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.currentTarget.classList.add("ring", "ring-neutral-700");
    const insertIndex = findInsertIndex(event);
    if (insertIndex !== null) setDropIndex(insertIndex);
    else setDropIndex(null);
  };

  const handleDragLeave = (event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    event.currentTarget.classList.remove("ring", "ring-neutral-700");
    setDropIndex(null);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.currentTarget.classList.remove("ring", "ring-neutral-700");
    const insertIndex = findInsertIndex(event);
    setDropIndex(null);
    const payload = JSON.parse(event.dataTransfer.getData("application/x-card"));
    onDropCard(payload.cardId, payload.fromCol, insertIndex ?? cards.length);
  };

  const totalSecs = (cards || []).reduce((acc, c) => acc + (c?.durationSec || 0), 0);
  const groupTotals = {};
  (cards || []).forEach((card) => {
    const groupId = card?.group;
    if (!groupId || !CARD_GROUPS[groupId]) return;
    groupTotals[groupId] = (groupTotals[groupId] || 0) + (card.durationSec || 0);
  });
  const orderedGroupTotals = [
    ...CARD_GROUP_ORDER.map((id) => ({ id, total: groupTotals[id] || 0 })),
    ...Object.keys(groupTotals)
      .filter((id) => !CARD_GROUP_ORDER.includes(id))
      .map((id) => ({ id, total: groupTotals[id] })),
  ].filter((entry) => entry.total > 0);

  const renderDropIndicator = (position) => (
    <div
      key={`drop-indicator-${position}`}
      data-drop-indicator="true"
      className="pointer-events-none h-0 border-t-2 border-dashed"
      style={{ borderColor: palette.text, opacity: 0.6 }}
    />
  );

  return (
    <section
      className="flex flex-col gap-3 rounded-2xl border p-4 shadow-sm transition-shadow"
      style={{ backgroundColor: palette.surface, borderColor: palette.border }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="flex items-center gap-2">
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
          {orderedGroupTotals.map(({ id, total }) => {
            const group = CARD_GROUPS[id];
            if (!group) return null;
            const colors = group.colors?.[isDark ? "dark" : "light"] || {};
            const pillBg = colors.badgeBg ?? palette.badge;
            const pillText = colors.badgeText ?? palette.text;
            const pillBorder = colors.cardBorder ?? palette.border;
              return (
                <span
                  key={id}
                  className="ml-2 rounded-full px-2 py-0.5 text-xs tabular-nums"
                  title={`${group.label} total time`}
                  style={{
                    backgroundColor: pillBg,
                    color: pillText,
                    border: `1px solid ${pillBorder}`,
                  }}
                >
                  {secsToHHMM(total)}
                </span>
              );
            })}
        </h2>
        {typeof onClearColumn === "function" ? (
          <button
            type="button"
            onClick={onClearColumn}
            disabled={!hasCards}
            className="interactive-button ml-auto rounded-lg border px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              borderColor: palette.border,
              color: hasCards ? palette.dangerText : palette.subtext,
              backgroundColor: palette.surface,
            }}
            title="Remove all tasks in this column"
          >
            Clear
          </button>
        ) : null}
      </header>
      <div data-list className="flex flex-col gap-3">
        {cards.map((card, index) => (
          <React.Fragment key={card.id}>
            {dropIndex === index ? renderDropIndicator(index) : null}
            {renderCard(card, index)}
          </React.Fragment>
        ))}
        {dropIndex !== null && dropIndex >= cards.length ? renderDropIndicator("end") : null}
      </div>
      <button
        type="button"
        onClick={onAddCard}
        className="interactive-surface flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium"
        style={{ backgroundColor: palette.card, borderColor: palette.border, color: palette.subtext }}
      >
        <span className="text-lg leading-none">+</span>
        <span>Add task</span>
      </button>
    </section>
  );
}
