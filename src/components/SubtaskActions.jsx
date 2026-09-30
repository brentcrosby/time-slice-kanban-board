import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pencil, Timer, Trash2 } from "lucide-react";
import { MenuButton } from "./MenuButton";

export function SubtaskActions({ subtask, onEdit, onDelete, onStartStopwatch, showStopwatchAction, onOpenChange, palette, color }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    onOpenChange?.(open);
    if (!open) return;
    const outside = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape" && containerRef.current?.contains(event.target)) {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      onOpenChange?.(false);
    };
  }, [open, onOpenChange]);

  useLayoutEffect(() => {
    if (!open) return;
    const bounds = triggerRef.current?.getBoundingClientRect();
    if (bounds && menuRef.current) setUp(window.innerHeight - bounds.bottom < menuRef.current.scrollHeight + 8 && bounds.top > window.innerHeight - bounds.bottom);
  }, [open]);

  const act = (callback) => () => { setOpen(false); callback(); };
  const itemClass = "header-action-button flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm";

  return (
    <div ref={containerRef} className={`relative shrink-0 ${open ? "z-40" : ""}`}>
      <MenuButton ref={triggerRef} color={color} aria-label={`Options for subtask ${subtask.title}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)} />
      {open && (
        <div ref={menuRef} role="dialog" aria-label={`Options for subtask ${subtask.title}`} className={`absolute right-0 z-40 w-44 rounded-xl border p-1.5 shadow-xl ${up ? "bottom-full mb-2" : "top-full mt-2"}`} style={{ backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }}>
          <button type="button" className={itemClass} onClick={act(onEdit)}><Pencil size={16} />Edit subtask</button>
          {showStopwatchAction && <button type="button" className={itemClass} onClick={act(onStartStopwatch)}><Timer size={16} />Start stopwatch</button>}
          <button type="button" className={itemClass} style={{ color: palette.dangerText }} onClick={act(onDelete)}><Trash2 size={16} />Delete subtask</button>
        </div>
      )}
    </div>
  );
}
