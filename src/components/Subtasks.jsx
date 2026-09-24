import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, GripVertical, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { uid } from "../utils/misc";

const SUBTASK_TYPE = "application/x-subtask";

export function Subtasks({
  cardId,
  subtasks = [],
  onChange,
  adding,
  onAddingChange,
  palette,
  textColor,
  subtextColor,
  borderColor,
}) {
  const [expanded, setExpanded] = useState(true);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [draggingId, setDraggingId] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const addInputRef = useRef(null);
  const editInputRef = useRef(null);
  const completedCount = subtasks.filter((subtask) => subtask.completed).length;

  useEffect(() => {
    if (adding && !expanded) {
      setExpanded(true);
    } else if (adding) {
      addInputRef.current?.focus();
    }
  }, [adding, expanded]);

  useEffect(() => {
    if (editingId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingId]);

  const addSubtask = (title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const id = uid();
    onChange((current) => [...current, { id, title: trimmed, completed: false }]);
  };

  const startAdding = () => {
    setExpanded(true);
    onAddingChange(true);
  };

  const commitEdit = () => {
    const trimmed = editDraft.trim();
    if (trimmed) {
      onChange((current) => {
        const existing = current.find((subtask) => subtask.id === editingId);
        if (!existing || existing.title === trimmed) return current;
        return current.map((subtask) =>
          subtask.id === editingId ? { ...subtask, title: trimmed } : subtask
        );
      });
    }
    setEditingId(null);
  };

  const reorderSubtask = (subtaskId, insertIndex) => {
    onChange((current) => {
      const fromIndex = current.findIndex((subtask) => subtask.id === subtaskId);
      if (fromIndex === -1) return current;
      const targetIndex = Math.max(0, Math.min(insertIndex - (fromIndex < insertIndex ? 1 : 0), current.length - 1));
      if (targetIndex === fromIndex) return current;
      const reordered = [...current];
      const [item] = reordered.splice(fromIndex, 1);
      reordered.splice(targetIndex, 0, item);
      return reordered;
    });
  };

  const findInsertIndex = (event) => {
    const rows = Array.from(event.currentTarget.querySelectorAll("[data-subtask-id]"));
    const index = rows.findIndex((row) => {
      const rect = row.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    return index === -1 ? rows.length : index;
  };

  const handleDragOver = (event) => {
    if (!Array.from(event.dataTransfer.types).includes(SUBTASK_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDropIndex(findInsertIndex(event));
  };

  const handleDragLeave = (event) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setDropIndex(null);
  };

  const handleDrop = (event) => {
    if (!Array.from(event.dataTransfer.types).includes(SUBTASK_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();
    const insertIndex = findInsertIndex(event);
    setDropIndex(null);
    try {
      const payload = JSON.parse(event.dataTransfer.getData(SUBTASK_TYPE));
      if (payload.cardId === cardId) reorderSubtask(payload.subtaskId, insertIndex);
    } catch {
      // Ignore unrelated or malformed drags.
    }
  };

  const indicator = (key) => (
    <div key={key} className="pointer-events-none h-0 border-t-2 border-dashed" style={{ borderColor: textColor }} />
  );

  const iconButtonClass = "interactive-button rounded-md p-1.5 transition-colors hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/30 md:p-1";
  const inputStyle = { color: textColor, backgroundColor: palette.surface, borderColor };

  if (!subtasks.length && !adding) return null;

  return (
    <section data-subtasks className="mt-3 border-t pt-2" style={{ borderColor }} aria-label="Subtasks">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="interactive-button flex min-w-0 items-center gap-1.5 rounded-md px-1 py-1 text-left text-sm font-medium transition-colors hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/30 md:text-xs"
          style={{ color: subtextColor }}
          aria-expanded={expanded}
          aria-label={`Subtasks: ${completedCount} of ${subtasks.length} complete`}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />}
          <ListChecks className="h-4 w-4 flex-shrink-0" />
          <span>Subtasks</span>
          {subtasks.length > 0 ? <span className="tabular-nums">{completedCount}/{subtasks.length}</span> : null}
        </button>
        <button
          type="button"
          onClick={startAdding}
          className="interactive-button flex items-center gap-1 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/30 md:text-xs"
          style={{ color: subtextColor }}
          aria-label="Add subtask"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add</span>
        </button>
      </div>

      {expanded ? (
        <div className="mt-1" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
          {subtasks.map((subtask, index) => (
            <React.Fragment key={subtask.id}>
              {dropIndex === index ? indicator(`before-${subtask.id}`) : null}
              <div
                data-subtask-id={subtask.id}
                className="group/subtask flex min-w-0 items-center gap-1 rounded-md py-0.5"
                style={{ opacity: draggingId === subtask.id ? 0.45 : 1 }}
              >
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.stopPropagation();
                    event.dataTransfer.setData(SUBTASK_TYPE, JSON.stringify({ cardId, subtaskId: subtask.id }));
                    event.dataTransfer.effectAllowed = "move";
                    setDraggingId(subtask.id);
                  }}
                  onDragEnd={(event) => {
                    event.stopPropagation();
                    setDraggingId(null);
                    setDropIndex(null);
                  }}
                  onKeyDown={(event) => {
                    if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
                    event.preventDefault();
                    reorderSubtask(subtask.id, index + (event.key === "ArrowUp" ? -1 : 2));
                  }}
                  className={`${iconButtonClass} cursor-grab active:cursor-grabbing`}
                  style={{ color: subtextColor }}
                  title="Drag to reorder; Alt+Up/Down also works"
                  aria-label={`Reorder ${subtask.title}`}
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </button>
                <input
                  type="checkbox"
                  checked={Boolean(subtask.completed)}
                  onChange={() => onChange((current) => current.map((item) =>
                    item.id === subtask.id ? { ...item, completed: !item.completed } : item
                  ))}
                  className="h-4 w-4 flex-shrink-0 cursor-pointer rounded"
                  style={{ accentColor: textColor }}
                  aria-label={`Complete ${subtask.title}`}
                />
                {editingId === subtask.id ? (
                  <input
                    ref={editInputRef}
                    value={editDraft}
                    onChange={(event) => setEditDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitEdit();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        setEditingId(null);
                      }
                    }}
                    onBlur={commitEdit}
                    className="min-w-0 flex-1 rounded-md border px-2 py-1 text-base outline-none focus-visible:outline focus-visible:outline-2 md:text-xs"
                    style={inputStyle}
                    aria-label="Edit subtask"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(subtask.id);
                      setEditDraft(subtask.title);
                    }}
                    className="interactive-button min-w-0 flex-1 break-words rounded-md px-1 py-1 text-left text-sm transition-colors hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/30 md:text-xs"
                    style={{ color: subtask.completed ? subtextColor : textColor, textDecoration: subtask.completed ? "line-through" : "none" }}
                    title="Click to rename"
                  >
                    {subtask.title}
                  </button>
                )}
                {editingId !== subtask.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(subtask.id);
                      setEditDraft(subtask.title);
                    }}
                    className={iconButtonClass}
                    style={{ color: subtextColor }}
                    aria-label={`Rename ${subtask.title}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onChange((current) => current.filter((item) => item.id !== subtask.id))}
                  className={iconButtonClass}
                  style={{ color: subtextColor }}
                  aria-label={`Delete ${subtask.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </React.Fragment>
          ))}
          {dropIndex === subtasks.length ? indicator("end") : null}
          {adding ? (
            <input
              ref={addInputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (draft.trim()) {
                    addSubtask(draft);
                    setDraft("");
                  } else {
                    onAddingChange(false);
                  }
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setDraft("");
                  onAddingChange(false);
                }
              }}
              onBlur={() => {
                addSubtask(draft);
                setDraft("");
                onAddingChange(false);
              }}
              className="mt-1 w-full rounded-md border px-2 py-1.5 text-base outline-none focus-visible:outline focus-visible:outline-2 md:text-xs"
              style={inputStyle}
              placeholder="Subtask name"
              aria-label="New subtask"
              autoComplete="off"
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
