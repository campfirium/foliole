import {
  coverCompletedSyncGroupRound,
  emptySyncGroupCoverage,
  isSyncGroupCoveragePayload,
  mergeSyncGroupCoverage,
  syncGroupCoverageLine,
  type SyncGroupCoveragePayload
} from '../../platform/syncGroupCoverageContract.js';

import type { DbPort } from './dbPort.js';
import { loadSyncGroupLocalAdoption } from './syncGroupLocalAdoption.js';
import { loadSyncGroupOverwriteProgress } from './syncGroupOverwriteProgress.js';

/** Clock disagreement between members that a version time may carry beyond the group line. */
export const SYNC_GROUP_LINE_CLOCK_MARGIN_MS = 24 * 60 * 60 * 1000;

export const syncGroupCoverageKey = (groupId: string) => `sync_group_coverage:${groupId}`;
export const SYNC_GROUP_COVERAGE_VALUE_SQL = 'SELECT value FROM sync_group_metadata WHERE key = ?';
export const SYNC_GROUP_COVERAGE_BASIS_SQL = `SELECT restore_id FROM sync_group_restore_events
  WHERE group_id = ? ORDER BY restored_at DESC, restore_id DESC LIMIT 1`;
export const SYNC_GROUP_COVERAGE_SAVE_SQL = `INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`;

/** Coverage collected before the latest group restore says nothing about the restored libraries. */
export function readStoredSyncGroupCoverage(value: string | undefined, basis: string): SyncGroupCoveragePayload {
  const stored: unknown = value ? JSON.parse(value) : null;
  return isSyncGroupCoveragePayload(stored) && stored.basis === basis ? stored : emptySyncGroupCoverage(basis);
}

export async function loadSyncGroupCoverage(db: DbPort, groupId: string): Promise<SyncGroupCoveragePayload> {
  const [basis] = await db.query<{ restore_id: string }>(SYNC_GROUP_COVERAGE_BASIS_SQL, [groupId]);
  const [row] = await db.query<{ value: string }>(SYNC_GROUP_COVERAGE_VALUE_SQL, [syncGroupCoverageKey(groupId)]);
  return readStoredSyncGroupCoverage(row?.value, basis?.restore_id ?? '');
}

async function saveSyncGroupCoverage(db: DbPort, groupId: string, coverage: SyncGroupCoveragePayload) {
  await db.run(SYNC_GROUP_COVERAGE_SAVE_SQL,
    [syncGroupCoverageKey(groupId), JSON.stringify(coverage), new Date().toISOString()]);
}

export async function mergeIncomingSyncGroupCoverage(db: DbPort, groupId: string,
  incoming: SyncGroupCoveragePayload | undefined) {
  if (!incoming) return;
  await saveSyncGroupCoverage(db, groupId, mergeSyncGroupCoverage(await loadSyncGroupCoverage(db, groupId), incoming));
}

/** Only an ordinary round that ended with no difference proves both sides own the same data. */
export async function recordCompletedSyncGroupRound(db: DbPort, input: {
  groupId: string; localDeviceId: string; peerDeviceId: string; startedAt: string;
}) {
  if (await loadSyncGroupLocalAdoption(db) || await loadSyncGroupOverwriteProgress(db)) return;
  const coverage = await loadSyncGroupCoverage(db, input.groupId);
  await saveSyncGroupCoverage(db, input.groupId,
    coverCompletedSyncGroupRound(coverage, input.localDeviceId, input.peerDeviceId, input.startedAt));
}

/** History made and superseded before this time is owned by every active member. */
export async function loadSyncGroupHistoryHorizon(db: DbPort, groupId: string) {
  const members = await db.query<{ device_identity_key: string }>(`SELECT device_identity_key
    FROM sync_group_devices WHERE group_id = ? AND state = 'active'`, [groupId]);
  const line = syncGroupCoverageLine(await loadSyncGroupCoverage(db, groupId),
    members.map(member => member.device_identity_key));
  return line ? new Date(Date.parse(line) - SYNC_GROUP_LINE_CLOCK_MARGIN_MS).toISOString() : null;
}
