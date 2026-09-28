import React, { useEffect, useRef, useState } from "react";
import { Flag, ListPlus, MoreHorizontal, MousePointer2, Timer, Pencil, Trash2, ArrowRight, ChevronDown, ArrowUpToLine, ArrowDownToLine } from "lucide-react";
import { SegmentLimitEditor } from "./SegmentLimitEditor";

export function CardActions({
  card, hasTimer, hasStopwatch, palette, color, borderColor, onSetSegments, onStartStopwatch,
  onAddSubtask, onToggleFlag, onSelect, onOpenChange, onEdit, onRemove,
  colId, onMove,
}) {
  const [open, setOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [placement, setPlacement] = useState({ up: false, maxHeight: 480 });
  const container = useRef(null);
  const trigger = useRef(null);
  useEffect(() => {
    onOpenChange(open);
    if (!open) {
      setMoveOpen(false);
      return undefined;
    }
    const position = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom;
      const up = below < 400 && rect.top > below;
      const cardRect = trigger.current.closest("[data-card-id]").getBoundingClientRect();
      setPlacement({
        up,
        offset: up ? cardRect.bottom - rect.top + 8 : rect.bottom - cardRect.top + 8,
        maxHeight: Math.max(140, Math.min(window.innerHeight * 0.7, (up ? rect.top : below) - 16)),
      });
    };
    position();
    const outside = (event) => {
      if (!container.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const frame = requestAnimationFrame(() => container.current?.querySelector('[data-card-actions] button')?.focus({ preventScroll: true }));
    document.addEventListener("pointerdown", outside, true);
    container.current?.addEventListener("keydown", escape);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    const node = container.current;
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", outside, true);
      node?.removeEventListener("keydown", escape);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, onOpenChange]);
  const act = (callback) => () => { setOpen(false); callback(); };
  const buttonClass = "header-action-button flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm";
  return <div ref={container} data-card-controls className="shrink-0">
    <button ref={trigger} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="dialog" title="Task options" aria-label={`Options for ${card.title || "task"}`} className="interactive-button rounded-md p-2 hover:bg-black/10 md:p-1" style={{ color }}>
      <MoreHorizontal className="h-4 w-4" />
    </button>
    {open && <div data-card-actions role="dialog" aria-label="Task options" className="absolute inset-x-0 z-30 overflow-y-auto rounded-xl border p-1.5 shadow-xl" style={{ [placement.up ? "bottom" : "top"]: placement.offset, maxHeight: placement.maxHeight, backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }}>
      <button className={buttonClass} onClick={act(onEdit)}><Pencil size={16} />Edit task</button>
      {!card.flagged && <button className={buttonClass} onClick={act(onToggleFlag)}><Flag size={16} />Flag as important</button>}
      {!card.subtasks?.length && <button className={buttonClass} onClick={act(onAddSubtask)}><ListPlus size={16} />Add subtask</button>}
      {!hasStopwatch && !hasTimer && <>
        <SegmentLimitEditor card={card} palette={palette} subtextColor={palette.text} borderColor={borderColor} menuMode onSetSegments={(segments) => { onSetSegments(segments); setOpen(false); }} />
        <button className={buttonClass} onClick={act(onStartStopwatch)}><Timer size={16} />Start stopwatch</button>
      </>}
      <div className="my-1 border-t" style={{ borderColor: palette.border }} />
      <button type="button" className={buttonClass} aria-expanded={moveOpen} onClick={() => setMoveOpen((value) => !value)}><ArrowRight size={16} />Move to<ChevronDown size={16} className={`ml-auto transition-transform ${moveOpen ? "rotate-180" : ""}`} /></button>
      {moveOpen && <div role="group" aria-label="Move task" className="ml-3 border-l pl-1" style={{ borderColor: palette.border }}>
        <button type="button" className={buttonClass} onClick={act(() => onMove(colId, "top"))}><ArrowUpToLine size={16} />Move to top</button>
        <button type="button" className={buttonClass} onClick={act(() => onMove(colId, "bottom"))}><ArrowDownToLine size={16} />Move to bottom</button>
        {[["todo", "Do"], ["doing", "Doing"], ["done", "Done"]].map(([id, label]) => <button type="button" key={id} disabled={colId === id} className={`${buttonClass} disabled:opacity-40`} onClick={act(() => onMove(id, "bottom"))}><ArrowRight size={16} />Move to {label}</button>)}
      </div>}
      <button className={buttonClass} onClick={act(onSelect)}><MousePointer2 size={16} />Select task</button>
      <button className={buttonClass} style={{ color: palette.dangerText }} onClick={act(onRemove)}><Trash2 size={16} />Delete task</button>
    </div>}
  </div>;
}
