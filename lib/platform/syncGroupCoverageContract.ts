/**
 * Group-wide coverage: cells[holder][origin] is a time before which the holder already owned every
 * change the origin had made. `basis` is the group restore the cells were collected under.
 */
export interface SyncGroupCoveragePayload {
  basis: string;
  cells: Record<string, Record<string, string>>;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;

export function isSyncGroupCoveragePayload(value: unknown): value is SyncGroupCoveragePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Partial<SyncGroupCoveragePayload>;
  if (typeof raw.basis !== 'string' || !raw.cells || typeof raw.cells !== 'object' || Array.isArray(raw.cells)) return false;
  return Object.entries(raw.cells).every(([holder, row]) => holder.length > 0 &&
    Boolean(row) && typeof row === 'object' && !Array.isArray(row) &&
    Object.entries(row).every(([origin, at]) => origin.length > 0 && origin !== holder &&
      typeof at === 'string' && ISO.test(at)));
}

export function emptySyncGroupCoverage(basis: string): SyncGroupCoveragePayload {
  return { basis, cells: {} };
}

function raise(cells: SyncGroupCoveragePayload['cells'], holder: string, origin: string, at: string | undefined) {
  if (!at || holder === origin) return;
  const row = cells[holder] ??= {};
  if (!row[origin] || row[origin] < at) row[origin] = at;
}

/** Cells only ever move forward; coverage collected under another restore is ignored. */
export function mergeSyncGroupCoverage(local: SyncGroupCoveragePayload, incoming: SyncGroupCoveragePayload | undefined) {
  const cells = structuredClone(local.cells);
  if (incoming && incoming.basis === local.basis) {
    for (const [holder, row] of Object.entries(incoming.cells)) {
      for (const [origin, at] of Object.entries(row)) raise(cells, holder, origin, at);
    }
  }
  return { basis: local.basis, cells };
}

/**
 * A completed round leaves both sides with identical current data, so each now owns everything the
 * other owned before the round started, including what either had received from third devices.
 */
export function coverCompletedSyncGroupRound(coverage: SyncGroupCoveragePayload,
  localDeviceId: string, peerDeviceId: string, startedAt: string) {
  const cells = structuredClone(coverage.cells);
  raise(cells, localDeviceId, peerDeviceId, startedAt);
  raise(cells, peerDeviceId, localDeviceId, startedAt);
  const origins = new Set([...Object.keys(cells[localDeviceId] ?? {}), ...Object.keys(cells[peerDeviceId] ?? {})]);
  for (const origin of origins) {
    const at = [cells[localDeviceId]?.[origin], cells[peerDeviceId]?.[origin]].filter(Boolean).sort().at(-1);
    raise(cells, localDeviceId, origin, at);
    raise(cells, peerDeviceId, origin, at);
  }
  return { basis: coverage.basis, cells };
}

/** The group line: every active member owns every other member's changes made before it. */
export function syncGroupCoverageLine(coverage: SyncGroupCoveragePayload, activeMembers: readonly string[]) {
  if (activeMembers.length < 2) return null;
  let line: string | null = null;
  for (const holder of activeMembers) for (const origin of activeMembers) {
    if (holder === origin) continue;
    const at = coverage.cells[holder]?.[origin];
    if (!at) return null;
    if (!line || at < line) line = at;
  }
  return line;
}

/** How far a member may fall behind the rest of the group before it no longer holds the group line back. */
export const SYNC_GROUP_MEMBER_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;

export function syncGroupMemberLastSync(coverage: SyncGroupCoveragePayload, member: string, joinedAt: string) {
  let latest = joinedAt;
  for (const [holder, row] of Object.entries(coverage.cells)) for (const [origin, at] of Object.entries(row)) {
    if ((holder === member || origin === member) && at > latest) latest = at;
  }
  return latest;
}

/**
 * Expired: the rest of the group kept completing rounds for 90 days after this member last did. A group
 * where nobody synced has no member to blame, so nobody expires and the line simply waits.
 */
export function isSyncGroupMemberExpired(coverage: SyncGroupCoveragePayload, member: string, joinedAt: string) {
  let others: string | null = null;
  for (const [holder, row] of Object.entries(coverage.cells)) for (const [origin, at] of Object.entries(row)) {
    if (holder !== member && origin !== member && (!others || at > others)) others = at;
  }
  if (!others) return false;
  return Date.parse(syncGroupMemberLastSync(coverage, member, joinedAt)) < Date.parse(others) - SYNC_GROUP_MEMBER_EXPIRY_MS;
}
