export function localClock(now, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
    return { date: `${value.year}-${value.month}-${value.day}`, hour: Number(value.hour) };
  } catch { return null; }
}

export function dueTasks(state, date) {
  return ["todo", "doing"].flatMap((column) => Array.isArray(state?.cardsByCol?.[column]) ? state.cardsByCol[column] : [])
    .filter((card) => card && !card.isDraft && card.dueDate === date && typeof card.title === "string" && card.title.trim());
}

export function reminderPayload(cards, date) {
  const names = cards.slice(0, 3).map((card) => card.title.trim().slice(0, 80));
  return JSON.stringify({
    type: "tasky-due",
    date,
    title: cards.length === 1 ? "Task due today" : `${cards.length} tasks due today`,
    body: names.join(" · ") + (cards.length > names.length ? ` · +${cards.length - names.length} more` : ""),
  });
}

export function allowedEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password &&
      (url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com" ||
        url.hostname === "web.push.apple.com" || url.hostname.endsWith(".push.apple.com") ||
        url.hostname.endsWith(".notify.windows.com"));
  } catch { return false; }
}
