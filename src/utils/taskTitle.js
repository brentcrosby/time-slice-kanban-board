import { parseTimeFromTitle } from "./time";
import { extractDueShortcut } from "./dueDates";

export function parseTaskTitle(rawTitle, now = new Date()) {
  const due = extractDueShortcut(rawTitle, now);
  const parsed = parseTimeFromTitle(due.cleanTitle);
  return { ...parsed, ...due, cleanTitle: parsed.cleanTitle };
}
