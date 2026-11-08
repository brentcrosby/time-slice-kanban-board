import React from "react";
import { Copy, Scissors, ClipboardPaste, Flag, Trash2, X, ArrowRight, CopyPlus } from "lucide-react";
import { Modal } from "./Modal";
import { CARD_GROUP_OPTIONS } from "../constants/groups";
import { BulkDueDateControls } from "./BulkDueDateControls";

export function TaskSelectionToolbar({ selection, palette }) {
  const { selected, clipboard } = selection;
  if (!selected.length && !clipboard && !selection.deleteIds) return null;
  const buttonClass = "header-action-button inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs disabled:opacity-40";
  const style = { borderColor: palette.border };
  const group = selected[0]?.group || "";
  const selectedGroup = selected.every((card) => (card.group || "") === group) ? group : "mixed";
  return <>
    <div data-task-selection className="sticky top-16 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-xl border p-3 shadow-sm" style={{ backgroundColor: palette.surface, borderColor: palette.border }}>
      <span className="text-sm font-medium" role="status">{selected.length} selected</span>
      <select aria-label="Destination column" value={selection.destination} onChange={(event) => selection.setDestination(event.target.value)} className="rounded-md border px-2 py-1.5 text-sm" style={{ ...style, backgroundColor: palette.surface, color: palette.text }}>
        <option value="todo">Do</option><option value="doing">Doing</option><option value="done">Done</option>
      </select>
      <button className={buttonClass} style={style} disabled={!selected.length} onClick={() => selection.move()}><ArrowRight size={14} />Move</button>
      <label className="inline-flex items-center gap-1.5 text-xs">Group
        <select aria-label="Group for selected tasks" disabled={!selected.length} value={selectedGroup} onChange={(event) => selection.setGroup(event.target.value)}
          className="rounded-md border px-2 py-1.5 text-base disabled:opacity-40 md:text-sm" style={{ ...style, backgroundColor: palette.surface, color: palette.text }}>
          <option value="mixed" disabled>Mixed groups</option>
          {CARD_GROUP_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}{option.value ? ` (${option.value.toUpperCase()})` : ""}</option>)}
        </select>
      </label>
      <button className={buttonClass} style={style} disabled={!selected.length} onClick={() => selection.copy("copy")} title="Copy tasks (⌘/Ctrl+C)"><Copy size={14} />Copy</button>
      <button className={buttonClass} style={style} disabled={!selected.length} onClick={() => selection.copy("cut")} title="Cut tasks (⌘/Ctrl+X)"><Scissors size={14} />Cut</button>
      {clipboard && <button className={buttonClass} style={style} onClick={selection.paste} title="Paste tasks into the chosen column (⌘/Ctrl+V)"><ClipboardPaste size={14} />Paste</button>}
      <button className={buttonClass} style={style} disabled={!selected.length} onClick={selection.duplicate}><CopyPlus size={14} />Duplicate</button>
      <button className={buttonClass} style={style} disabled={!selected.length} onClick={selection.flag}><Flag size={14} />{selection.allFlagged ? "Unflag" : "Flag"}</button>
      <button className={buttonClass} style={{ ...style, color: palette.dangerText }} disabled={!selected.length} onClick={selection.requestDelete}><Trash2 size={14} />Delete</button>
      <button className="header-action-button ml-auto rounded-md p-1.5" onClick={selection.clear} title="Clear selection and clipboard" aria-label="Clear selection and clipboard"><X size={16} /></button>
      {selected.length > 0 && <BulkDueDateControls key={selected.map((card) => card.id).sort().join(",")} selected={selected} onApply={selection.setDueDate} palette={palette} />}
      <p className="w-full text-xs" style={{ color: palette.subtext }}>
        {clipboard ? `${clipboard.cards.length} task${clipboard.cards.length === 1 ? "" : "s"} ${clipboard.mode === "cut" ? "ready to move when pasted" : "copied in Tasky"}. ` : ""}
        Cmd/Ctrl-click to toggle · Shift-click for a range · Escape to clear
      </p>
    </div>
    {selection.deleteIds && <Modal title={`Delete ${selection.deleteIds.length} selected task${selection.deleteIds.length === 1 ? "" : "s"}?`} onClose={selection.cancelDelete} palette={palette}>
      <p className="text-sm" style={{ color: palette.subtext }}>You can undo this with Cmd/Ctrl+Z.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button className={buttonClass} style={style} onClick={selection.cancelDelete}>Cancel</button>
        <button className={buttonClass} style={{ ...style, color: palette.dangerText }} onClick={selection.confirmDelete}>Delete tasks</button>
      </div>
    </Modal>}
  </>;
}
