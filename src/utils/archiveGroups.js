function archiveTimestamp(card) {
  for (const value of [card.completedAt, card.archivedAt]) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

export function archivedTaskLoggedSeconds(card) {
  const stopwatchSeconds = (stopwatch) => Math.max(0, Number(stopwatch?.elapsedSec) || 0);
  return stopwatchSeconds(card.stopwatch)
    + (card.subtasks || []).reduce((total, subtask) => total + stopwatchSeconds(subtask.stopwatch), 0);
}

function localDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayLabel(dayKey, now) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey === localDayKey(today)) return "Today";
  if (dayKey === localDayKey(yesterday)) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(date);
}

export function groupArchivedCardsByDay(cards, now = new Date()) {
  const groups = new Map();
  for (const card of cards) {
    const timestamp = archiveTimestamp(card);
    const key = timestamp == null ? "unavailable" : localDayKey(new Date(timestamp));
    if (!groups.has(key)) groups.set(key, { key, label: key === "unavailable" ? "Date unavailable" : dayLabel(key, now), cards: [], loggedSeconds: 0 });
    const group = groups.get(key);
    group.cards.push(card);
    group.loggedSeconds += archivedTaskLoggedSeconds(card);
  }

  return [...groups.values()].sort((left, right) => {
    if (left.key === "unavailable") return 1;
    if (right.key === "unavailable") return -1;
    return right.key.localeCompare(left.key);
  });
}
