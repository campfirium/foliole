import {
  coverCompletedSyncGroupRound,
  emptySyncGroupCoverage,
  isSyncGroupCoveragePayload,
  isSyncGroupMemberExpired,
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

export const SYNC_GROUP_ACTIVE_MEMBERS_SQL = `SELECT device_identity_key, joined_at FROM sync_group_devices
  WHERE group_id = ? AND state = 'active'`;
export const SYNC_GROUP_LOCAL_MEMBER_SQL = `SELECT local_device_identity_key FROM sync_group_local_state
  WHERE singleton_id = 1 AND state = 'active' AND group_id = ?`;

export type SyncGroupMemberRow = { device_identity_key: string; joined_at: string };

/** Expired members are left out; an expired local device has no line of its own until it is overwritten. */
export function syncGroupHistoryHorizon(coverage: SyncGroupCoveragePayload, members: readonly SyncGroupMemberRow[],
  localDeviceId: string | undefined) {
  const current = members.filter(member => !isSyncGroupMemberExpired(coverage, member.device_identity_key, member.joined_at));
  if (!localDeviceId || !current.some(member => member.device_identity_key === localDeviceId)) return null;
  const line = syncGroupCoverageLine(coverage, current.map(member => member.device_identity_key));
  return line ? new Date(Date.parse(line) - SYNC_GROUP_LINE_CLOCK_MARGIN_MS).toISOString() : null;
}

/** History made and superseded before this time is owned by every current member. */
export async function loadSyncGroupHistoryHorizon(db: DbPort, groupId: string) {
  const members = await db.query<SyncGroupMemberRow>(SYNC_GROUP_ACTIVE_MEMBERS_SQL, [groupId]);
  const [local] = await db.query<{ local_device_identity_key: string }>(SYNC_GROUP_LOCAL_MEMBER_SQL, [groupId]);
  return syncGroupHistoryHorizon(await loadSyncGroupCoverage(db, groupId), members, local?.local_device_identity_key);
}

/** Whether a member, judged with the coverage it brings along, may still take part in ordinary rounds. */
export function isSyncGroupMemberCurrent(coverage: SyncGroupCoveragePayload, incoming: SyncGroupCoveragePayload | undefined,
  member: SyncGroupMemberRow | undefined) {
  if (!member) return true;
  return !isSyncGroupMemberExpired(mergeSyncGroupCoverage(coverage, incoming), member.device_identity_key, member.joined_at);
}

export async function loadSyncGroupLocalExpiry(db: DbPort, groupId: string) {
  const [local] = await db.query<{ local_device_identity_key: string }>(SYNC_GROUP_LOCAL_MEMBER_SQL, [groupId]);
  const members = await db.query<SyncGroupMemberRow>(SYNC_GROUP_ACTIVE_MEMBERS_SQL, [groupId]);
  const member = members.find(row => row.device_identity_key === local?.local_device_identity_key);
  return !isSyncGroupMemberCurrent(await loadSyncGroupCoverage(db, groupId), undefined, member);
}

/**
 * An overwrite from a provider leaves this device with exactly the provider's data, and its own earlier
 * changes no longer exist anywhere they could be needed: both directions are covered from its start.
 */
export async function coverAdoptedSyncGroupLibrary(db: DbPort, input: {
  groupId: string; providerDeviceId: string; startedAt: string;
}) {
  const [local] = await db.query<{ local_device_identity_key: string }>(SYNC_GROUP_LOCAL_MEMBER_SQL, [input.groupId]);
  if (!local) return;
  const coverage = await loadSyncGroupCoverage(db, input.groupId);
  await saveSyncGroupCoverage(db, input.groupId, coverCompletedSyncGroupRound(coverage,
    local.local_device_identity_key, input.providerDeviceId, input.startedAt));
}

/** Ordinary rounds need both sides current; an expired side first overwrites itself from the group. */
export async function syncGroupMembersCurrent(db: DbPort, groupId: string, senderId: string,
  incoming: SyncGroupCoveragePayload | undefined) {
  const members = await db.query<SyncGroupMemberRow>(SYNC_GROUP_ACTIVE_MEMBERS_SQL, [groupId]);
  const coverage = await loadSyncGroupCoverage(db, groupId);
  const sender = members.find(row => row.device_identity_key === senderId);
  return isSyncGroupMemberCurrent(coverage, incoming, sender) && !await loadSyncGroupLocalExpiry(db, groupId);
}
