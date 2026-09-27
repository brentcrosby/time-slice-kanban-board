export const DEFAULT_DUE_TIME = "23:59";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTH_RE = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const WEEKDAY_RE = "(?:sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?)";
const DATE_RE = `(?:today|tomorrow|tmrw|tmr|tonight|in\\s+\\d+\\s+days?|(?:next|this)\\s+${WEEKDAY_RE}|${WEEKDAY_RE}|\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?|${MONTH_RE}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|none|clear|remove)`;
const TIME_RE = "(?:[01]?\\d|2[0-3]):[0-5]\\d\\s*(?:am|pm)?|(?:0?[1-9]|1[0-2])\\s*(?:am|pm)";
const DUE_RE = new RegExp(`\\bdue\\s+(?:by\\s+|on\\s+)?(${DATE_RE})(?:\\s+(?:at|by)\\s+(${TIME_RE})|\\s+(${TIME_RE}))?(?=$|[\\s.,;!?)])`, "i");

export const localDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const validDate = (year, month, day) => {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day ? date : null;
};

const nextDate = (month, day, year, now) => {
  if (year != null) return validDate(year, month, day);
  for (let candidateYear = now.getFullYear(); candidateYear <= now.getFullYear() + 8; candidateYear += 1) {
    const candidate = validDate(candidateYear, month, day);
    if (candidate && localDateKey(candidate) >= localDateKey(now)) return candidate;
  }
  return null;
};

function parseDateExpression(raw, now) {
  const value = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (["none", "clear", "remove"].includes(value)) return null;
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (value === "today" || value === "tonight") return base;
  if (["tomorrow", "tmrw", "tmr"].includes(value)) { base.setDate(base.getDate() + 1); return base; }
  const relative = value.match(/^in (\d+) days?$/);
  if (relative) { base.setDate(base.getDate() + Number(relative[1])); return base; }
  const weekday = value.match(/^(?:(next|this) )?(\w+)$/);
  const weekdayIndex = weekday ? WEEKDAYS.findIndex((day) => day.startsWith(weekday[2]) && weekday[2].length >= 3) : -1;
  if (weekdayIndex >= 0) {
    let days = (weekdayIndex - base.getDay() + 7) % 7;
    if (weekday[1] === "next") days += days === 0 ? 7 : 0;
    base.setDate(base.getDate() + days);
    return base;
  }
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const slash = value.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (slash) {
    const year = slash[3] ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]) : null;
    return nextDate(Number(slash[1]), Number(slash[2]), year, now);
  }
  const named = value.match(new RegExp(`^(${MONTH_RE})\\.? (\\d{1,2})(?:st|nd|rd|th)?(?:,? (\\d{4}))?$`, "i"));
  if (named) {
    const month = MONTHS.findIndex((name) => name.startsWith(named[1].replace(/\.$/, "").slice(0, 3))) + 1;
    return nextDate(month, Number(named[2]), named[3] ? Number(named[3]) : null, now);
  }
  return null;
}

function parseTimeExpression(raw) {
  if (!raw) return null;
  const match = raw.toLowerCase().replace(/\s+/g, "").match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (minute > 59 || (!match[3] && match[2] == null) || (match[3] && (hour < 1 || hour > 12)) || (!match[3] && hour > 23)) return null;
  if (match[3]) hour = (hour % 12) + (match[3] === "pm" ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function extractDueShortcut(rawTitle, now = new Date()) {
  const match = String(rawTitle || "").match(DUE_RE);
  if (!match) return { cleanTitle: rawTitle || "", dueFound: false };
  const date = parseDateExpression(match[1], now);
  if (date === null && !/^(none|clear|remove)$/i.test(match[1])) return { cleanTitle: rawTitle, dueFound: false };
  const explicitTime = match[2] || match[3] || "";
  const dueTime = explicitTime ? parseTimeExpression(explicitTime) : DEFAULT_DUE_TIME;
  if (!dueTime) return { cleanTitle: rawTitle, dueFound: false };
  return {
    cleanTitle: (rawTitle.slice(0, match.index) + rawTitle.slice(match.index + match[0].length)).replace(/\s{2,}/g, " ").trim(),
    dueFound: true,
    dueDate: date ? localDateKey(date) : null,
    dueTime: date ? dueTime : null,
    dueTimeExplicit: Boolean(date && explicitTime),
  };
}

export function applyDueDate(card, dueDate, dueTime = DEFAULT_DUE_TIME, dueTimeExplicit = false) {
  if (card.dueDate === dueDate) return { ...card, dueDate: dueDate || null, dueTime: dueDate ? dueTime : null, dueTimeExplicit: Boolean(dueDate && dueTimeExplicit) };
  return {
    ...card,
    dueDate: dueDate || null,
    dueTime: dueDate ? dueTime : null,
    dueTimeExplicit: Boolean(dueDate && dueTimeExplicit),
    flagged: card.dueDate && card.autoFlaggedDueDate === card.dueDate ? false : Boolean(card.flagged),
    autoFlaggedDueDate: null,
    dueReminderHandledDate: null,
  };
}

export function setManualFlag(card, flagged, today = localDateKey()) {
  return {
    ...card,
    flagged,
    autoFlaggedDueDate: null,
    dueReminderHandledDate: card.dueDate && card.dueDate <= today ? card.dueDate : card.dueReminderHandledDate ?? null,
  };
}

export function flagDueTasks(board, today = localDateKey()) {
  let changed = false;
  const next = { ...board };
  for (const column of ["todo", "doing"]) {
    next[column] = (board[column] || []).map((card) => {
      if (!card.dueDate || card.dueDate > today || card.dueReminderHandledDate === card.dueDate || card.isDraft) return card;
      changed = true;
      return { ...card, flagged: true, dueReminderHandledDate: card.dueDate, autoFlaggedDueDate: card.flagged ? null : card.dueDate };
    });
  }
  return changed ? next : board;
}

export function formatDueDate(card, now = new Date()) {
  if (!card.dueDate) return "";
  const [year, month, day] = card.dueDate.split("-").map(Number);
  const date = validDate(year, month, day);
  if (!date) return "";
  const dateLabel = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", ...(year !== now.getFullYear() ? { year: "numeric" } : {}) }).format(date);
  const [hour, minute] = (card.dueTime || DEFAULT_DUE_TIME).split(":").map(Number);
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hour, minute));
  return `Due ${dateLabel} at ${time}`;
}
