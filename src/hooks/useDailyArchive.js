import { useEffect } from "react";
import { archiveDoneBeforeToday, nextLocalMidnight } from "../utils/dailyArchive";

export function useDailyArchive(enabled, doneCards, updateBoard) {
  useEffect(() => {
    if (!enabled || !doneCards.length) return;
    let timeout;
    const check = () => {
      window.clearTimeout(timeout);
      const now = Date.now();
      updateBoard((previous) => archiveDoneBeforeToday(previous, now));
      timeout = window.setTimeout(check, Math.max(1, nextLocalMidnight(now) - now));
    };
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, doneCards, updateBoard]);
}
