export function summarizeGroupTasks(cards, groupIds) {
  const groups = new Map(groupIds.map((id) => [id, { id, totalSeconds: 0, untimedCount: 0 }]));

  for (const card of cards || []) {
    const group = groups.get(card?.group);
    if (!group) continue;
    const duration = Number(card?.durationSec) || 0;
    if (duration > 0) group.totalSeconds += duration;
    else group.untimedCount += 1;
  }

  return [...groups.values()].filter(({ totalSeconds, untimedCount }) => totalSeconds > 0 || untimedCount > 0);
}
