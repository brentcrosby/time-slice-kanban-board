import { useEffect, useState } from "react";

const REFRESH_THRESHOLD = 72;
const INTERACTIVE_TARGETS = 'button, input, textarea, select, [contenteditable="true"], [data-card-actions], [data-subtasks], [role="dialog"]';

export function usePullToRefresh() {
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px), (pointer: coarse)");
    let gesture = null;
    let reloadTimeout = null;

    const reset = () => {
      gesture = null;
      setOffset(0);
    };

    const onStart = (event) => {
      gesture = null;
      if (!mobile.matches || event.touches.length !== 1 || window.scrollY > 1 || document.scrollingElement?.scrollTop > 1) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (event.target instanceof Element && event.target.closest(INTERACTIVE_TARGETS)) return;
      const touch = event.touches[0];
      gesture = { x: touch.clientX, y: touch.clientY, offset: 0 };
    };

    const onMove = (event) => {
      if (!gesture) return;
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      const touch = event.touches[0];
      const down = touch.clientY - gesture.y;
      const sideways = Math.abs(touch.clientX - gesture.x);
      if (down <= 0 || sideways > down) {
        reset();
        return;
      }
      if (window.scrollY > 1 || document.scrollingElement?.scrollTop > 1) {
        reset();
        return;
      }
      if (down < 8) return;
      if (event.cancelable) event.preventDefault();
      gesture.offset = Math.min(down * 0.58, 110);
      setOffset(gesture.offset);
    };

    const onEnd = (event) => {
      if (event.touches.length) {
        reset();
        return;
      }
      if (gesture?.offset >= REFRESH_THRESHOLD) {
        gesture = null;
        setRefreshing(true);
        reloadTimeout = window.setTimeout(() => window.location.reload(), 100);
      } else {
        reset();
      }
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", reset);
      window.clearTimeout(reloadTimeout);
    };
  }, []);

  return { offset, ready: offset >= REFRESH_THRESHOLD, refreshing };
}
