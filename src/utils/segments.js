import { MIN_SEGMENT_SEC, MAX_SEGMENT_SEC } from "../constants";
import { clamp, uid } from "./misc";

export const sanitizeSegmentDuration = (sec) => clamp(Math.floor(sec || 0), MIN_SEGMENT_SEC, MAX_SEGMENT_SEC);

export const coerceSegmentDurations = (rawSegments, fallbackSec = 1500) => {
  const durations = (rawSegments || [])
    .map((seg) => {
      if (typeof seg === "number") return sanitizeSegmentDuration(seg);
      if (seg == null) return null;
      const candidate = seg.durationSec ?? seg.duration ?? seg.seconds ?? seg.remainingSec;
      if (candidate == null) return null;
      return sanitizeSegmentDuration(candidate);
    })
    .filter((sec) => Number.isFinite(sec) && sec >= MIN_SEGMENT_SEC);
  if (durations.length) return durations;
  return [sanitizeSegmentDuration(fallbackSec || 1500)];
};

export const withSegmentIds = (segments, cardId = "card") =>
  segments.map((seg, idx) => ({
    id: seg.id || `${cardId}-seg-${idx}-${Math.random().toString(36).slice(2, 7)}`,
    durationSec: sanitizeSegmentDuration(
      seg.durationSec ?? seg.duration ?? seg.seconds ?? seg.remainingSec ?? MIN_SEGMENT_SEC
    ),
    remainingSec: clamp(
      Math.floor(seg.remainingSec ?? seg.durationSec ?? seg.duration ?? seg.seconds ?? seg.remainingSec ?? MIN_SEGMENT_SEC),
      0,
      sanitizeSegmentDuration(seg.durationSec ?? seg.duration ?? seg.seconds ?? seg.remainingSec ?? MIN_SEGMENT_SEC)
    ),
  }));

export const normalizeSegments = (rawSegments, cardId = "card") => {
  const withDurations = withSegmentIds(rawSegments, cardId).map((seg) => {
    const durationSec = sanitizeSegmentDuration(seg.durationSec);
    const remainingSec = clamp(Math.floor(seg.remainingSec ?? durationSec), 0, durationSec);
    return { ...seg, durationSec, remainingSec };
  });
  return withDurations;
};

export const totalFromSegments = (segments) =>
  segments.reduce((acc, seg) => acc + Math.max(0, Math.floor(seg.durationSec || 0)), 0);

export const findNextActiveSegment = (segments) => {
  const idx = segments.findIndex((seg) => (seg.remainingSec ?? 0) > 0);
  if (idx === -1) return Math.max(0, segments.length - 1);
  return idx;
};

export const deriveCardFromSegments = (card, rawSegments, overrides = {}) => {
  const segments = normalizeSegments(rawSegments, card.id || overrides.id || "card");
  const totalDuration = totalFromSegments(segments);
  const totalRemaining = segments.reduce((acc, seg) => acc + seg.remainingSec, 0);
  const requestedIndex = overrides.activeSegmentIndex ?? card.activeSegmentIndex;
  let activeSegmentIndex =
    typeof requestedIndex === "number" && !Number.isNaN(requestedIndex)
      ? clamp(requestedIndex, 0, Math.max(segments.length - 1, 0))
      : findNextActiveSegment(segments);
  if (!Number.isFinite(activeSegmentIndex)) activeSegmentIndex = findNextActiveSegment(segments);
  const activeSegment = segments[activeSegmentIndex] || segments[segments.length - 1] || { remainingSec: 0 };
  const isRunning = overrides.running ?? card.running ?? false;
  const remainingSecAtStart =
    overrides.remainingSecAtStart ??
    (isRunning ? card.remainingSecAtStart ?? activeSegment.remainingSec : activeSegment.remainingSec);
  const overtime = overrides.overtime ?? (totalRemaining <= 0 && activeSegmentIndex === segments.length - 1);
  return {
    ...card,
    ...overrides,
    segments,
    durationSec: totalDuration,
    remainingSec: totalRemaining,
    activeSegmentIndex,
    remainingSecAtStart,
    running: isRunning && totalRemaining > 0,
    overtime,
  };
};

export const upgradeLegacyCard = (card) => {
  if (!card) return card;
  if (Array.isArray(card.segments) && card.segments.length) {
    return deriveCardFromSegments({ ...card }, card.segments, {
      running: card.running,
      remainingSecAtStart: card.remainingSecAtStart,
      activeSegmentIndex: card.activeSegmentIndex,
      overtime: card.overtime,
    });
  }

  const baseDuration = sanitizeSegmentDuration(card.durationSec ?? card.remainingSec ?? 1500);
  const baseRemaining = clamp(Math.floor(card.remainingSec ?? baseDuration), 0, baseDuration);
  return deriveCardFromSegments(
    { ...card },
    [
      {
        id: `${card.id || "card"}-seg-0`,
        durationSec: baseDuration,
        remainingSec: baseRemaining,
      },
    ],
    {
      running: card.running,
      remainingSecAtStart: card.remainingSecAtStart ?? baseRemaining,
      activeSegmentIndex: 0,
      overtime: card.overtime,
    }
  );
};

export const formatSegmentForInput = (sec) => {
  const minutes = Math.max((sec || 0) / 60, MIN_SEGMENT_SEC / 60);
  if (!Number.isFinite(minutes)) return "1";
  if (Number.isInteger(minutes)) return String(minutes);
  return minutes.toFixed(2).replace(/\.0+$/, "").replace(/0+$/, "").replace(/\.$/, "");
};

export const segmentDraftsFromSegments = (segments) => {
  const source = segments && segments.length ? segments : [];
  if (!source.length) {
    return [{ id: `draft-${uid()}`, value: "25" }];
  }
  return source.map((seg) => ({
    id: seg.id || `draft-${uid()}`,
    value: formatSegmentForInput(seg.durationSec ?? 1500),
  }));
};
