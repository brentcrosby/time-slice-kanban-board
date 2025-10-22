import { clamp } from "./misc";
import { MIN_SEGMENT_SEC, MAX_SEGMENT_SEC } from "../constants";

const pad2 = (n) => n.toString().padStart(2, "0");

export const secsToHMS = (s) => {
  const sign = s < 0 ? "-" : "";
  s = Math.abs(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h) return `${sign}${h}:${pad2(m)}:${pad2(sec)}`;
  return `${sign}${m}:${pad2(sec)}`;
};

// Parse free-form duration like 90, 25m, 1:30, 1h 20m, 2h
export function parseDurationToSeconds(input) {
  const str = String(input ?? "").trim().toLowerCase();
  if (!str) return null;

  const hhmmss = str.match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
  if (hhmmss) {
    const hours = parseInt(hhmmss[1], 10) || 0;
    const minutes = parseInt(hhmmss[2], 10) || 0;
    const seconds = parseInt(hhmmss[3], 10) || 0;
    if (minutes >= 0 && minutes < 60 && seconds >= 0 && seconds < 60) {
      return hours * 3600 + minutes * 60 + seconds;
    }
  }

  const mmss = str.match(/^(\d+):(\d{1,2})$/);
  if (mmss) {
    const minutes = parseInt(mmss[1], 10) || 0;
    const seconds = parseInt(mmss[2], 10) || 0;
    if (seconds >= 0 && seconds < 60) {
      return minutes * 60 + seconds;
    }
  }

  const verbose = str.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)$/);
  if (verbose && (verbose[1] || verbose[2])) {
    const hours = verbose[1] ? parseFloat(verbose[1]) : 0;
    const minutes = verbose[2] ? parseFloat(verbose[2]) : 0;
    return Math.round(hours * 3600 + minutes * 60);
  }

  const loose = str.match(/^(\d+(?:\.\d+)?)(?:\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes))?$/);
  if (loose) {
    const amount = parseFloat(loose[1]);
    const unit = loose[2] || "m";
    return /^h/.test(unit) ? Math.round(amount * 3600) : Math.round(amount * 60);
  }

  return null;
}

const DURATION_TOKEN_RE =
  /(?:\d+:\d{1,2}:\d{1,2})|(?:\d+:\d{1,2})|(?:\d+(?:\.\d+)?\s*h(?:ours?)?(?:\s*\d+(?:\.\d+)?\s*m(?:in(?:ute)?s?)?)?)|(?:\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes))|(?:\b\d+(?:\.\d+)?\b)/gi;
const GROUP_TOKEN_RE = /\b(g[1-3])\b/gi;

export function parseTimeFromTitle(rawTitle) {
  let title = rawTitle || "";
  if (!rawTitle) return { cleanTitle: title, durationSec: null, segments: [], groupId: null };

  let detectedGroup = null;
  const titleWithoutGroups = title.replace(GROUP_TOKEN_RE, (match) => {
    if (!detectedGroup) detectedGroup = match.toLowerCase();
    return " ";
  });
  title = titleWithoutGroups;

  const matches = [];
  const numericOnly = /^\d+(?:\.\d+)?$/;
  for (const match of rawTitle.matchAll(DURATION_TOKEN_RE)) {
    const token = match[0];
    if (numericOnly.test(token.trim())) continue;
    const sec = parseDurationToSeconds(token);
    if (sec && sec >= MIN_SEGMENT_SEC && sec <= MAX_SEGMENT_SEC) {
      matches.push({ token, sec: clamp(sec, MIN_SEGMENT_SEC, MAX_SEGMENT_SEC) });
    }
  }

  if (matches.length > 1) {
    matches.forEach(({ token }) => {
      title = title.replace(token, " ");
    });
    title = title.replace(/[()\[\]\-_,]+/g, " ").replace(/\s{2,}/g, " ").trim();
    const durations = matches.map((m) => m.sec);
    const total = durations.reduce((acc, sec) => acc + sec, 0);
    return {
      cleanTitle: title.trim() || titleWithoutGroups.trim() || rawTitle.trim(),
      durationSec: total,
      segments: durations,
      groupId: detectedGroup,
    };
  }

  if (matches.length === 1) {
    const [{ token, sec }] = matches;
    title = title.replace(token, " ");
    title = title.replace(/[()\[\]\-_,]+/g, " ").replace(/\s{2,}/g, " ").trim();
    return {
      cleanTitle: title || titleWithoutGroups.trim() || rawTitle.trim(),
      durationSec: sec,
      segments: [],
      groupId: detectedGroup,
    };
  }

  const lower = rawTitle.toLowerCase();
  let durationSec = null;

  const hhmmss = lower.match(/\b(\d+):(\d{1,2}):(\d{1,2})\b/);
  if (hhmmss) {
    const hours = parseInt(hhmmss[1], 10) || 0;
    const minutes = parseInt(hhmmss[2], 10) || 0;
    const seconds = parseInt(hhmmss[3], 10) || 0;
    if (minutes >= 0 && minutes < 60 && seconds >= 0 && seconds < 60) {
      durationSec = hours * 3600 + minutes * 60 + seconds;
      title = title.replace(hhmmss[0], "");
    }
  }

  const mmss = durationSec == null ? lower.match(/\b(\d+):(\d{1,2})\b/) : null;
  if (mmss) {
    const minutes = parseInt(mmss[1], 10) || 0;
    const seconds = parseInt(mmss[2], 10) || 0;
    if (seconds >= 0 && seconds < 60) {
      durationSec = minutes * 60 + seconds;
      title = title.replace(mmss[0], "");
    }
  }

  if (durationSec == null) {
    const verbose = lower.match(/\b(?:(\d+(?:\.\d+)?)\s*h(?:ours?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)\b/);
    if (verbose && (verbose[1] || verbose[2])) {
      const hours = verbose[1] ? parseFloat(verbose[1]) : 0;
      const minutes = verbose[2] ? parseFloat(verbose[2]) : 0;
      durationSec = Math.round(hours * 3600 + minutes * 60);
      title = title.replace(verbose[0], "");
    }
  }

  if (durationSec == null) {
    const loose = lower.match(/\b(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/);
    if (loose) {
      const amount = parseFloat(loose[1]);
      const unit = loose[2];
      durationSec = /^h/.test(unit) ? Math.round(amount * 3600) : Math.round(amount * 60);
      title = title.replace(loose[0], "");
    }
  }

  title = title.replace(/[()\[\]\-_,]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return {
    cleanTitle: title || titleWithoutGroups.trim() || rawTitle.trim(),
    durationSec,
    segments: [],
    groupId: detectedGroup,
  };
}
