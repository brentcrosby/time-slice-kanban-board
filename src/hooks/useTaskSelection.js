import { useEffect, useRef, useState } from "react";
import { copyTask, moveTasks, pauseTask, selectionRange, TASK_COLUMNS } from "../utils/taskActions";
import { uid } from "../utils/misc";
import { setManualFlag } from "../utils/dueDates";

export function useTaskSelection({ board, orderedIds, updateBoard, removeChimes }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [destination, setDestination] = useState("todo");
  const [clipboard, setClipboard] = useState(null);
  const [deleteIds, setDeleteIds] = useState(null);
  const anchor = useRef(null);
  const tasks = TASK_COLUMNS.flatMap((column) => board[column] || []);
  const selected = tasks.filter((card) => selectedIds.has(card.id));
  const allFlagged = selected.length > 0 && selected.every((card) => card.flagged);

  useEffect(() => {
    const live = new Set(TASK_COLUMNS.flatMap((column) => board[column] || []).map((card) => card.id));
    setSelectedIds((prev) => [...prev].some((id) => !live.has(id)) ? new Set([...prev].filter((id) => live.has(id))) : prev);
  }, [board]);

  const select = (id, column, event = {}) => {
    setDestination(column);
    setSelectedIds((prev) => {
      if (event.shiftKey) {
        const range = selectionRange(orderedIds, anchor.current, id);
        return new Set(event.metaKey || event.ctrlKey ? [...prev, ...range] : range);
      }
      if (event.metaKey || event.ctrlKey) {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      }
      return new Set([id]);
    });
    if (!event.shiftKey) anchor.current = id;
  };

  const setAnchor = (id) => { anchor.current = id; };

  const move = (column = destination, index = null) => {
    updateBoard((prev) => moveTasks(prev, selectedIds, column, index), { track: true });
    if (column === "done") removeChimes([...selectedIds]);
    setDestination(column);
  };

  const copy = (mode = "copy") => {
    if (!selected.length) return;
    const now = Date.now();
    setClipboard({ mode, ids: selected.map((card) => card.id), cards: selected.map((card) => JSON.parse(JSON.stringify(pauseTask(card, now)))) });
  };

  const paste = () => {
    if (!clipboard) return;
    if (clipboard.mode === "cut") {
      updateBoard((prev) => moveTasks(prev, clipboard.ids, destination), { track: true });
      if (destination === "done") removeChimes(clipboard.ids);
      setSelectedIds(new Set(clipboard.ids.filter((id) => tasks.some((card) => card.id === id))));
      setClipboard(null);
    } else {
      const copies = clipboard.cards.map((card) => copyTask(card, destination, uid()));
      updateBoard((prev) => ({ ...prev, [destination]: [...(prev[destination] || []), ...copies] }), { track: true });
      setSelectedIds(new Set(copies.map((card) => card.id)));
    }
  };

  const duplicate = () => {
    const copies = selected.map((card) => copyTask(card, destination, uid()));
    updateBoard((prev) => ({ ...prev, [destination]: [...(prev[destination] || []), ...copies] }), { track: true });
    setSelectedIds(new Set(copies.map((card) => card.id)));
  };

  const flag = () => updateBoard((prev) => Object.fromEntries(TASK_COLUMNS.map((column) => [column,
    (prev[column] || []).map((card) => selectedIds.has(card.id) ? setManualFlag(card, !allFlagged) : card),
  ])), { track: true });

  const confirmDelete = () => {
    const ids = new Set(deleteIds);
    updateBoard((prev) => Object.fromEntries(TASK_COLUMNS.map((column) => [column, (prev[column] || []).filter((card) => !ids.has(card.id))])), { track: true });
    removeChimes([...ids]);
    setDeleteIds(null);
    setSelectedIds(new Set());
  };

  useEffect(() => {
    const handleKey = (event) => {
      if (event.defaultPrevented || document.querySelector('[aria-modal="true"]')) return;
      if (event.target.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      const key = event.key.toLowerCase();
      const command = event.metaKey || event.ctrlKey;
      if (command && key === "a" && orderedIds.length) {
        event.preventDefault();
        setSelectedIds(new Set(orderedIds));
      } else if (command && (key === "c" || key === "x") && selected.length) {
        event.preventDefault();
        copy(key === "x" ? "cut" : "copy");
      } else if (command && key === "v" && clipboard) {
        event.preventDefault();
        paste();
      } else if ((key === "backspace" || key === "delete") && selected.length && !command) {
        event.preventDefault();
        setDeleteIds([...selectedIds]);
      } else if (key === "escape") {
        setSelectedIds(new Set());
        setClipboard(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  useEffect(() => {
    const outside = (event) => {
      if (!event.target.closest?.('[data-card-id], [data-task-selection], [role="dialog"]')) setSelectedIds(new Set());
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);

  return { selectedIds, selected, destination, setDestination, select, setAnchor, move, copy, paste, duplicate, flag, allFlagged,
    clipboard, deleteIds, confirmDelete, cancelDelete: () => setDeleteIds(null), requestDelete: () => setDeleteIds([...selectedIds]),
    clear: () => { setSelectedIds(new Set()); setClipboard(null); },
  };
}
