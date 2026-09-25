export const BOARD_COLUMNS = ["todo", "doing", "done"];

// Firestore does not preserve object key insertion order. Compare the board's
// contents, not the incidental order in which its fields were serialized.
export const boardFingerprint = (state) => JSON.stringify({
  autoMoveEnabled: state?.autoMoveEnabled ?? true,
  cardsByCol: Object.fromEntries(BOARD_COLUMNS.map((column) => [
    column,
    state?.cardsByCol?.[column] || [],
  ])),
}, (_key, value) => {
  if (!value || Array.isArray(value) || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]));
});

export const hasTasks = (state) => BOARD_COLUMNS.some((column) => state?.cardsByCol?.[column]?.length);

export const initialSyncAction = (local, remote, baseline) => {
  const localFingerprint = boardFingerprint(local);
  const remoteFingerprint = boardFingerprint(remote);
  if (localFingerprint === remoteFingerprint) return "same";
  if (!hasTasks(local) || localFingerprint === baseline) return "remote";
  if (remoteFingerprint === baseline) return "local";
  return "conflict";
};

export const incomingSyncAction = (local, remote, baseline) => {
  const localFingerprint = boardFingerprint(local);
  const remoteFingerprint = boardFingerprint(remote);
  if (localFingerprint === remoteFingerprint) return "same";
  if (remoteFingerprint === baseline) return "local";
  if (localFingerprint === baseline) return "remote";
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
  const usedIds = new Set(remoteCards.keys());

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

  return { cardsByCol, autoMoveEnabled: remote?.autoMoveEnabled ?? local?.autoMoveEnabled ?? true };
};
