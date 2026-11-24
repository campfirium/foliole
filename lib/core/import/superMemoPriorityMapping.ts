export const DEFAULT_SUPER_MEMO_PRIORITY_BOUNDARIES = Object.freeze([0, 11, 22, 33, 44, 56, 67, 78, 89, 100]);

export function superMemoPriorityPercent(rank: number | undefined, queueLength: number) {
  if (rank === undefined) return null;
  return queueLength === 1 ? 0 : (rank - 1) * 100 / (queueLength - 1);
}

export function mapSuperMemoPriority(sourcePercent: number | null | undefined,
  boundaries = DEFAULT_SUPER_MEMO_PRIORITY_BOUNDARIES) {
  if (sourcePercent == null) return 5;
  const index = boundaries.findIndex(end => sourcePercent < end);
  return index < 0 ? 9 : index;
}
