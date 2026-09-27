export const BOARD_COLUMNS = ["todo", "doing", "done"];

// Firestore does not preserve object key insertion order. Compare the board's
// contents, not the incidental order in which its fields were serialized.
export const boardFingerprint = (state) => JSON.stringify({
  autoMoveEnabled: state?.autoMoveEnabled ?? true,
  cardsByCol: Object.fromEntries(BOARD_COLUMNS.map((column) => [
    column,
    state?.cardsByCol?.[column] || [],
  ])),
  archivedCards: state?.archivedCards || [],
}, (_key, value) => {
  if (!value || Array.isArray(value) || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]));
});

export const hasTasks = (state) =>
  BOARD_COLUMNS.some((column) => state?.cardsByCol?.[column]?.length) || state?.archivedCards?.length > 0;

export const boardRevision = (state) => Number.isSafeInteger(state?.syncRevision) && state.syncRevision >= 0
  ? state.syncRevision : 0;

export const initialSyncAction = (local, remote, baseline, baselineRevision = 0) => {
  const localFingerprint = boardFingerprint(local);
  const remoteFingerprint = boardFingerprint(remote);
  if (localFingerprint === remoteFingerprint) return "same";
  const localRevision = boardRevision(local);
  const remoteRevision = boardRevision(remote);
  const localChangedSinceSync = localFingerprint !== baseline && localRevision > baselineRevision;
  if (localFingerprint === baseline || (!hasTasks(local) && !localChangedSinceSync)) return "remote";
  if (remoteRevision > localRevision) return localChangedSinceSync ? "conflict" : "remote";
  if (remoteFingerprint === baseline && localChangedSinceSync) return "local";
  return "conflict";
};

export const incomingSyncAction = (local, remote, baseline, baselineRevision = 0) => {
  const localFingerprint = boardFingerprint(local);
  const remoteFingerprint = boardFingerprint(remote);
  if (localFingerprint === remoteFingerprint) return "same";
  if (remoteFingerprint === baseline) {
    if (boardRevision(local) > baselineRevision) return "local";
    if (boardRevision(local) < baselineRevision) return "remote";
    return "conflict";
  }
  if (localFingerprint === baseline) return "remote";
  const localChangedSinceSync = boardRevision(local) > baselineRevision;
  if (boardRevision(remote) > boardRevision(local) && !localChangedSinceSync) return "remote";
  return "conflict";
};

export const mergeBoards = (local, remote) => {
  const cardsByCol = Object.fromEntries(BOARD_COLUMNS.map((column) => [
    column,
    [...(remote?.cardsByCol?.[column] || [])],
  ]));
  const remoteCards = new Map(BOARD_COLUMNS.flatMap((column) =>
    (remote?.cardsByCol?.[column] || []).map((card) => [card.id, card])
  ));
  (remote?.archivedCards || []).forEach((card) => remoteCards.set(card.id, card));
  const usedIds = new Set(remoteCards.keys());
  const archivedCards = [...(remote?.archivedCards || [])];

  for (const column of BOARD_COLUMNS) {
    for (const card of local?.cardsByCol?.[column] || []) {
      if (!usedIds.has(card.id)) {
        cardsByCol[column].push(card);
        usedIds.add(card.id);
      } else if (remoteCards.has(card.id) && boardFingerprint({ cardsByCol: { todo: [card] } }) !==
        boardFingerprint({ cardsByCol: { todo: [remoteCards.get(card.id)] } })) {
        // Both devices edited the same task. Keep both versions rather than
        // silently dropping the device copy when the user chooses Merge.
        let copyId;
        do {
          copyId = `${card.id}-device-${Math.random().toString(36).slice(2, 8)}`;
        } while (usedIds.has(copyId));
        usedIds.add(copyId);
        cardsByCol[column].push({ ...card, id: copyId, title: `${card.title || "Untitled"} (device copy)` });
      }
    }
  }

  for (const card of local?.archivedCards || []) {
    if (!usedIds.has(card.id)) {
      archivedCards.push(card);
      usedIds.add(card.id);
    } else if (remoteCards.has(card.id) && boardFingerprint({ cardsByCol: { todo: [card] } }) !==
      boardFingerprint({ cardsByCol: { todo: [remoteCards.get(card.id)] } })) {
      let copyId;
      do {
        copyId = `${card.id}-device-${Math.random().toString(36).slice(2, 8)}`;
      } while (usedIds.has(copyId));
      usedIds.add(copyId);
      archivedCards.push({ ...card, id: copyId, title: `${card.title || "Untitled"} (device copy)` });
    }
  }

  return {
    cardsByCol,
    archivedCards,
    autoMoveEnabled: remote?.autoMoveEnabled ?? local?.autoMoveEnabled ?? true,
  };
};
