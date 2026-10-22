/**
 * Every device syncs with exactly one upstream: the highest-priority device it can reach that ranks
 * above itself. Each device computes the order locally; no agreement or election is involved.
 */
export const SYNC_PRIORITY_TIER = { mobile: 0, desktop: 1, foregroundDesktop: 2 } as const;

export type SyncPriority = Readonly<{ tier: number; deviceId: string }>;

export function compareSyncPriority(left: SyncPriority, right: SyncPriority) {
  if (left.tier !== right.tier) return left.tier - right.tier;
  return left.deviceId < right.deviceId ? -1 : left.deviceId > right.deviceId ? 1 : 0;
}

export function selectSyncUpstream<T>(self: SyncPriority, candidates: readonly T[], priorityOf: (candidate: T) => SyncPriority) {
  let best: T | null = null;
  for (const candidate of candidates) {
    const priority = priorityOf(candidate);
    if (compareSyncPriority(priority, self) <= 0) continue;
    if (!best || compareSyncPriority(priority, priorityOf(best)) > 0) best = candidate;
  }
  return best;
}
