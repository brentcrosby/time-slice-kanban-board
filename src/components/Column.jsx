import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { secsToHHMM } from "../utils/time";
import { CARD_GROUP_ORDER, CARD_GROUPS, CARD_GROUP_OPTIONS } from "../constants/groups";
import { summarizeGroupTasks } from "../utils/groupChips";
import { Archive, MoreHorizontal, Plus } from "lucide-react";

export function Column({
  column,
  cards,
  totalCount,
  onDropCard,
  onAddCard,
  onAddCardAtTop,
  onClearColumn,
  onArchiveCompleted,
  renderCard,
  palette,
  isDark = false,
}) {
  const [dropIndex, setDropIndex] = useState(null);
  const chipsRef = useRef(null);
  const archiveMenuRef = useRef(null);
  const addMenuRef = useRef(null);
  const addMenuPanelRef = useRef(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addMenuLayout, setAddMenuLayout] = useState({ placement: "down", maxHeight: null });
  const [chipFadeState, setChipFadeState] = useState({ canScroll: false, atStart: true, atEnd: true });
  const cardCount = totalCount != null ? totalCount : cards.length;
  const hasCards = cardCount > 0;

  useEffect(() => {
    const handlePointerDown = (event) => {
      const menu = archiveMenuRef.current;
      if (menu?.open && !menu.contains(event.target)) menu.open = false;
      if (!addMenuRef.current?.contains(event.target)) setAddMenuOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && addMenuRef.current?.contains(event.target)) {
        addMenuRef.current.querySelector('[aria-expanded="true"]')?.focus();
        setAddMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useLayoutEffect(() => {
    if (!addMenuOpen) return;
    const updatePlacement = () => {
      const control = addMenuRef.current;
      const menu = addMenuPanelRef.current;
      if (!control || !menu) return;
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const bounds = control.getBoundingClientRect();
      const below = Math.max(0, viewportBottom - bounds.bottom - 8);
      const above = Math.max(0, bounds.top - viewportTop - 8);
      const menuHeight = menu.scrollHeight;
      const placement = below >= menuHeight || (above < menuHeight && below >= above) ? "down" : "up";
      const maxHeight = Math.floor(placement === "down" ? below : above);
      setAddMenuLayout((current) => current.placement === placement && current.maxHeight === maxHeight
        ? current : { placement, maxHeight });
    };
    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    window.visualViewport?.addEventListener("resize", updatePlacement);
    window.visualViewport?.addEventListener("scroll", updatePlacement);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
      window.visualViewport?.removeEventListener("resize", updatePlacement);
      window.visualViewport?.removeEventListener("scroll", updatePlacement);
    };
  }, [addMenuOpen]);

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
    if (!Array.from(event.dataTransfer.types).includes("application/x-card")) return;
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
    if (!Array.from(event.dataTransfer.types).includes("application/x-card")) return;
    event.preventDefault();
    event.currentTarget.classList.remove("ring", "ring-neutral-700");
    const insertIndex = findInsertIndex(event);
    setDropIndex(null);
    const payload = JSON.parse(event.dataTransfer.getData("application/x-card"));
    onDropCard(payload.cardId, payload.fromCol, insertIndex ?? cards.length);
  };

  const totalSecs = (cards || []).reduce((acc, c) => acc + (c?.durationSec || 0), 0);
  const groupSummaries = summarizeGroupTasks(cards, CARD_GROUP_ORDER);
  const groupTotalsSignature = groupSummaries
    .map(({ id, totalSeconds, untimedCount }) => `${id}:${totalSeconds}:${untimedCount}`)
    .join("|");

  const updateChipFadeState = useCallback(() => {
    const el = chipsRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const canScroll = scrollWidth > clientWidth + 1;
    const atStart = scrollLeft <= 1;
    const atEnd = scrollLeft + clientWidth >= scrollWidth - 1;
    setChipFadeState((prev) => {
      if (prev.canScroll === canScroll && prev.atStart === atStart && prev.atEnd === atEnd) {
        return prev;
      }
      return { canScroll, atStart, atEnd };
    });
  }, []);

  useEffect(() => {
    const el = chipsRef.current;
    if (!el) return;
    const handleScroll = () => updateChipFadeState();
    const handleResize = () => updateChipFadeState();
    updateChipFadeState();
    el.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);
    return () => {
      el.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [updateChipFadeState]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateChipFadeState);
    return () => window.cancelAnimationFrame(frame);
  }, [updateChipFadeState, totalSecs, cardCount, groupTotalsSignature]);

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
      data-column-id={column.id}
      className="flex flex-col gap-3 rounded-2xl border p-4 shadow-sm transition-shadow"
      style={{ backgroundColor: palette.surface, borderColor: palette.border }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="flex h-8 shrink-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2 className="flex-shrink-0 text-base font-semibold tracking-tight md:text-sm" style={{ color: palette.text }}>
            {column.name}
          </h2>
          <span
            className="flex-shrink-0 rounded-full px-2 py-0.5 text-sm md:text-xs"
            style={{ backgroundColor: palette.badge, color: palette.subtext }}
          >
            {cards.length}
          </span>
          <div className="relative min-w-0 flex-1">
            <div
              ref={chipsRef}
              className="flex min-w-0 items-center gap-2 overflow-x-auto py-0.5"
              style={{
                backgroundColor: palette.surface,
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                touchAction: "pan-x",
              }}
            >
              {totalSecs > 0 ? (
                <span
                  className="flex-shrink-0 rounded-full px-2 py-0.5 text-sm tabular-nums md:text-xs"
                  title="Total planned time"
                  style={{ backgroundColor: palette.badge, color: palette.text }}
                >
                  {secsToHHMM(totalSecs)}
                </span>
              ) : null}
              {groupSummaries.map(({ id, totalSeconds, untimedCount }) => {
                const group = CARD_GROUPS[id];
                if (!group) return null;
                const colors = group.colors?.[isDark ? "dark" : "light"] || {};
                const pillBg = colors.badgeBg ?? palette.badge;
                const pillText = colors.badgeText ?? palette.text;
                const pillBorder = colors.cardBorder ?? palette.border;
                const untimedLabel = `${untimedCount} untimed ${untimedCount === 1 ? "task" : "tasks"}`;
                const chipLabel = `${group.label}: ${totalSeconds > 0 ? `${secsToHHMM(totalSeconds)} planned time` : "no planned time"}${untimedCount > 0 ? `, ${untimedLabel}` : ""}`;
                return (
                  <span
                    key={id}
                    className="flex-shrink-0 rounded-full px-2 py-px text-sm tabular-nums md:text-xs"
                    title={chipLabel}
                    aria-label={chipLabel}
                    style={{
                      backgroundColor: pillBg,
                      color: pillText,
                      border: `1px solid ${pillBorder}`,
                    }}
                  >
                    {totalSeconds > 0 ? secsToHHMM(totalSeconds) : null}
                    {totalSeconds > 0 && untimedCount > 0 ? " · " : null}
                    {untimedCount > 0 ? untimedCount : null}
                  </span>
                );
              })}
            </div>
            {chipFadeState.canScroll && !chipFadeState.atStart ? (
              <div
                className="pointer-events-none absolute inset-y-0 left-0 w-6"
                style={{
                  backgroundImage: `linear-gradient(to right, ${palette.surface}, transparent)`,
                }}
              />
            ) : null}
            {chipFadeState.canScroll && !chipFadeState.atEnd ? (
              <div
                className="pointer-events-none absolute inset-y-0 right-0 w-6"
                style={{
                  backgroundImage: `linear-gradient(to left, ${palette.surface}, transparent)`,
                }}
              />
            ) : null}
          </div>
        </div>
        {typeof onClearColumn === "function" ? (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {column.id === "done" ? (
              <details ref={archiveMenuRef} className="relative">
                <summary
                  className="interactive-button flex cursor-pointer list-none items-center justify-center rounded-lg border px-3 py-1.5 text-sm md:px-2 md:py-1 md:text-xs"
                  style={{ borderColor: palette.border, color: palette.subtext, backgroundColor: palette.surface }}
                  title="Archive options"
                  aria-label="Archive options"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </summary>
                <div
                  className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border p-1.5 shadow-lg"
                  style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                >
                  <button
                    type="button"
                    disabled={!hasCards}
                    onClick={(event) => {
                      event.currentTarget.closest("details").open = false;
                      onArchiveCompleted?.();
                    }}
                    className="interactive-button flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ color: hasCards ? palette.text : palette.subtext }}
                  >
                    <Archive className="h-4 w-4 shrink-0" />
                    <span>Archive completed tasks</span>
                  </button>
                </div>
              </details>
            ) : null}
            <button
              type="button"
              onClick={onAddCardAtTop}
              className="interactive-button flex shrink-0 items-center justify-center rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors md:px-2 md:py-1 md:text-xs"
              style={{ borderColor: palette.border, color: palette.subtext, backgroundColor: palette.surface }}
              title={`Add task at top of ${column.name}`}
              aria-label={`Add task at top of ${column.name}`}
            >
              <span className="flex h-5 items-center md:h-4"><Plus className="h-4 w-4" /></span>
            </button>
            <button
              type="button"
              onClick={onClearColumn}
              disabled={!hasCards}
              className="interactive-button rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 md:px-2 md:py-1 md:text-xs"
              style={{
                borderColor: palette.border,
                color: hasCards ? palette.dangerText : palette.subtext,
                backgroundColor: palette.surface,
              }}
              title="Remove all tasks in this column"
            >
              Clear
            </button>
          </div>
        ) : null}
      </header>
      <div data-list className="flex flex-col gap-3 empty:hidden">
        {cards.map((card, index) => (
          <React.Fragment key={card.id}>
            {dropIndex === index ? renderDropIndicator(index) : null}
            {renderCard(card, index)}
          </React.Fragment>
        ))}
        {dropIndex !== null && dropIndex >= cards.length ? renderDropIndicator("end") : null}
      </div>
      <div ref={addMenuRef} data-add-task-control className="relative w-full rounded-xl border" style={{ backgroundColor: palette.card, borderColor: palette.border }}>
        <button
          type="button"
          onClick={() => { setAddMenuOpen(false); onAddCard(null); }}
          className="interactive-surface flex min-h-12 w-full items-center justify-center gap-1 rounded-xl px-2 py-3 text-sm font-medium"
          style={{ color: palette.subtext }}
        >
          <span className="text-lg leading-none">+</span>
          <span>Add task</span>
        </button>
        <button
          type="button"
          aria-label="Add task group options"
          aria-expanded={addMenuOpen}
          aria-controls={`add-task-groups-${column.id}`}
          onClick={() => setAddMenuOpen((open) => !open)}
          className="interactive-button absolute right-1 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md hover:bg-black/10"
          style={{ color: palette.subtext }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {addMenuOpen && (
          <div
            ref={addMenuPanelRef}
            id={`add-task-groups-${column.id}`}
            className={`absolute right-0 z-20 w-44 overflow-y-auto rounded-xl border p-1.5 shadow-lg ${addMenuLayout.placement === "up" ? "bottom-full mb-2" : "top-full mt-2"}`}
            style={{ backgroundColor: palette.surface, borderColor: palette.border, maxHeight: addMenuLayout.maxHeight ?? undefined }}
          >
            {CARD_GROUP_OPTIONS.map(({ value, label }) => {
              const colors = CARD_GROUPS[value]?.colors?.[isDark ? "dark" : "light"];
              return (
                <button
                  key={value}
                  type="button"
                  aria-label={value ? `Add ${label} task` : "Add task without a group"}
                  onClick={() => { setAddMenuOpen(false); onAddCard(value || null); }}
                  className="interactive-button flex w-full items-center gap-2 rounded-lg px-3 py-3 text-left text-sm"
                  style={{ color: palette.text }}
                >
                  <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full border" style={{ backgroundColor: colors?.badgeBg || palette.badge, borderColor: colors?.badgeText || palette.border }} />
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
