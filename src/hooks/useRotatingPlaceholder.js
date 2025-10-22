import { useCallback, useEffect, useRef, useState } from "react";

const ROTATION_INTERVAL_MS = 3000;
const FADE_DURATION_MS = 300;

export function useRotatingPlaceholder(samples, enabled) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const intervalRef = useRef(null);
  const fadeTimeoutRef = useRef(null);

  const clearTimers = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    if (!samples.length) {
      setIndex(0);
      clearTimers();
      return;
    }
    if (index >= samples.length) {
      setIndex(0);
    }
  }, [samples.length, index, clearTimers]);

  useEffect(() => {
    if (!enabled || !samples.length) {
      clearTimers();
      setVisible(false);
      return;
    }

    setVisible(true);

    if (samples.length === 1) return;

    clearTimers();
    intervalRef.current = setInterval(() => {
      setVisible(false);
      fadeTimeoutRef.current = setTimeout(() => {
        setIndex((prev) => (prev + 1) % samples.length);
        setVisible(true);
      }, FADE_DURATION_MS);
    }, ROTATION_INTERVAL_MS);

    return clearTimers;
  }, [enabled, samples, clearTimers]);

  const placeholder = samples.length ? samples[index % samples.length] : "";

  return { placeholder, visible };
}
