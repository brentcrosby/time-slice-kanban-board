import { parseTimeFromTitle } from "./time";
import { extractDueShortcut, formatDueDate } from "./dueDates";
import { CARD_GROUPS } from "../constants/groups";
import { sanitizeSegmentDuration } from "./segments";

export function parseTaskTitle(rawTitle, now = new Date()) {
  const due = extractDueShortcut(rawTitle, now);
  const parsed = parseTimeFromTitle(due.cleanTitle);
  return { ...parsed, ...due, cleanTitle: parsed.cleanTitle };
}

function durationLabel(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours && `${hours} hr`, minutes && `${minutes} min`, remainder && `${remainder} sec`].filter(Boolean).join(" ");
}

export function previewTaskTitle(rawTitle, now = new Date()) {
  const parsed = parseTaskTitle(rawTitle, now);
  const dueRange = parsed.dueRange;
  // Keep original character positions when the date phrase is removed before
  // duration/group parsing. A due time must never be highlighted as a timer.
  const maskedTitle = dueRange
    ? rawTitle.slice(0, dueRange.start) + " ".repeat(dueRange.end - dueRange.start) + rawTitle.slice(dueRange.end)
    : rawTitle;
  const ranges = parseTimeFromTitle(maskedTitle).shortcutRanges || [];
  const durations = (parsed.segments?.length > 1 ? parsed.segments : parsed.durationSec != null ? [parsed.durationSec] : []).map(sanitizeSegmentDuration);
  const timerLabel = `Timer: ${durations.map(durationLabel).join(" + ")}${durations.length > 1 ? ` (${durations.length} segments)` : ""}`;
  const tokens = ranges.map((range) => ({
    ...range,
    label: range.type === "group" ? `Group: ${CARD_GROUPS[parsed.groupId]?.label || "No group"}` : timerLabel,
  }));
  if (dueRange) tokens.push({ ...dueRange, type: "due", label: parsed.dueDate ? formatDueDate(parsed, now) : "Remove due date" });
  return tokens.sort((left, right) => left.start - right.start).map((token) => ({ ...token, text: rawTitle.slice(token.start, token.end) }));
}
