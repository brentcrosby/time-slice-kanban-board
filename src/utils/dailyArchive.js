import { pauseTask } from "./taskActions.js";

export function nextLocalMidnight(now) {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
}

// Archive as one board update so sync never sees a task removed from Done
// before its archived copy exists. Dates use the device's local calendar.
export function archiveDoneBeforeToday(board, now = Date.now()) {
  const date = new Date(now);
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const done = [];
  const archived = [];
  let changed = false;
  for (const card of board.cardsByCol.done || []) {
    if (card.isDraft || !card.title?.trim()) { done.push(card); continue; }
    const dates = [card.completedAt, card.doneSince].filter((value) => Number.isFinite(value) && value > 0);
    const since = dates.length ? Math.max(...dates) : now;
    if (since < today) {
      const midnight = nextLocalMidnight(since);
      archived.push({ ...pauseTask(card, midnight), archivedAt: midnight });
      changed = true;
    } else if (!dates.length) {
      // Undated legacy tasks get their first full day before being archived.
      done.push({ ...card, doneSince: now });
      changed = true;
    } else done.push(card);
  }
  if (!changed) return board;
  const ids = new Set(archived.map((card) => card.id));
  return { ...board, cardsByCol: { ...board.cardsByCol, done },
    archivedCards: [...archived, ...board.archivedCards.filter((card) => !ids.has(card.id))] };
}
