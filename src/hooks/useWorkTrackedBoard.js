import { useCallback, useState } from "react";
import { restoreWorkBoard, trackBoardWork, trackCardWork } from "../utils/workActivity";
import { upgradeLegacyCard } from "../utils/segments";

export function initializeWorkBoard(state, now = Date.now()) {
  return {
    cardsByCol: Object.fromEntries(["todo", "doing", "done"].map((column) => [column,
      (state?.cardsByCol?.[column] || []).map((card) => trackCardWork(null, upgradeLegacyCard(card), now)),
    ])),
    archivedCards: (state?.archivedCards || []).map(upgradeLegacyCard),
  };
}

export function useWorkTrackedBoard(initialState) {
  const [board, replaceBoard] = useState(() => initializeWorkBoard(initialState));
  const setCardsByCol = useCallback((updater) => {
    const now = Date.now();
    replaceBoard((previous) => {
      const next = typeof updater === "function" ? updater(previous.cardsByCol) : updater;
      return next === previous.cardsByCol ? previous : trackBoardWork(previous, next, now);
    });
  }, []);
  const setArchivedCards = useCallback((updater) => replaceBoard((previous) => {
    const next = typeof updater === "function" ? updater(previous.archivedCards) : updater;
    // An explicit archive takes precedence over the temporary deletion record.
    const seen = new Set();
    const archivedCards = [...next.filter((card) => !card.activityOnly), ...next.filter((card) => card.activityOnly)]
      .filter((card) => !seen.has(card.id) && seen.add(card.id));
    return { ...previous, archivedCards };
  }), []);
  const restoreSnapshot = useCallback((snapshot) => {
    const now = Date.now();
    replaceBoard((previous) => restoreWorkBoard(previous, snapshot, now));
  }, []);
  return { ...board, setCardsByCol, setArchivedCards, replaceBoard, restoreSnapshot };
}
