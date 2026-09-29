import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CARD_GROUPS, CARD_GROUP_OPTIONS } from "../constants/groups";
import { TASK_CONTENT_INSET } from "../constants/layout";
import { MenuButton } from "./MenuButton";

export function AddTaskButton({ columnId, onAddCard, palette, isDark = false }) {
  const controlRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState({ placement: "down", maxHeight: null });

  useEffect(() => {
    if (!open) return;
    const outside = (event) => {
      if (!controlRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape" && controlRef.current?.contains(event.target)) {
        triggerRef.current?.focus();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const updatePlacement = () => {
      const control = controlRef.current;
      const menu = panelRef.current;
      if (!control || !menu) return;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const bounds = control.getBoundingClientRect();
      const below = Math.max(0, viewportBottom - bounds.bottom - 8);
      const above = Math.max(0, bounds.top - viewportTop - 8);
      const menuHeight = menu.scrollHeight;
      const placement = below >= menuHeight || (above < menuHeight && below >= above) ? "down" : "up";
      const maxHeight = Math.floor(placement === "down" ? below : above);
      setLayout((current) => current.placement === placement && current.maxHeight === maxHeight
        ? current : { placement, maxHeight });
    };
    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    viewport?.addEventListener("resize", updatePlacement);
    viewport?.addEventListener("scroll", updatePlacement);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
      viewport?.removeEventListener("resize", updatePlacement);
      viewport?.removeEventListener("scroll", updatePlacement);
    };
  }, [open]);

  const add = (group) => {
    setOpen(false);
    onAddCard(group);
  };

  return (
    <div ref={controlRef} data-add-task-control className="relative w-full rounded-xl border" style={{ backgroundColor: palette.card, borderColor: palette.border }}>
      <button
        type="button"
        onClick={() => add(null)}
        className="interactive-surface flex min-h-12 w-full items-center justify-center gap-1 rounded-xl px-2 py-3 text-sm font-medium"
        style={{ color: palette.subtext }}
      >
        <span className="text-lg leading-none">+</span>
        <span>Add task</span>
      </button>
      <MenuButton
        ref={triggerRef}
        aria-label="Add task group options"
        aria-expanded={open}
        aria-controls={`add-task-groups-${columnId}`}
        onClick={() => setOpen((current) => !current)}
        className="absolute top-1/2 z-10 -translate-y-1/2"
        color={palette.subtext}
        style={{ right: TASK_CONTENT_INSET }}
      />
      {open && (
        <div
          ref={panelRef}
          id={`add-task-groups-${columnId}`}
          className={`absolute right-0 z-20 w-44 overflow-y-auto rounded-xl border p-1.5 shadow-lg ${layout.placement === "up" ? "bottom-full mb-2" : "top-full mt-2"}`}
          style={{ backgroundColor: palette.surface, borderColor: palette.border, maxHeight: layout.maxHeight ?? undefined }}
        >
          {CARD_GROUP_OPTIONS.map(({ value, label }) => {
            const colors = CARD_GROUPS[value]?.colors?.[isDark ? "dark" : "light"];
            return (
              <button
                key={value}
                type="button"
                aria-label={value ? `Add ${label} task` : "Add task without a group"}
                onClick={() => add(value || null)}
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
  );
}
