import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import {
  isSyncGroupMemberCurrent,
  readStoredSyncGroupCoverage,
  SYNC_GROUP_ACTIVE_MEMBERS_SQL,
  SYNC_GROUP_COVERAGE_BASIS_SQL,
  SYNC_GROUP_COVERAGE_SAVE_SQL,
  SYNC_GROUP_COVERAGE_VALUE_SQL,
  SYNC_GROUP_LOCAL_MEMBER_SQL,
  syncGroupCoverageKey,
  type SyncGroupMemberRow
} from '../../lib/core/sync/syncGroupCoverageStore.js';
import { mergeSyncGroupCoverage, type SyncGroupCoveragePayload } from '../../lib/platform/syncGroupCoverageContract.js';
import type { SyncGroupMemberStatePayload } from '../../lib/platform/syncGroupMemberStateContract.js';

import { openDatabaseConnection } from './connection.js';

export function loadDesktopSyncGroupCoverage(driver: DatabaseDriver, groupId: string) {
  const basis = driver.queryOne<{ restore_id: string }>(SYNC_GROUP_COVERAGE_BASIS_SQL, [groupId]);
  const row = driver.queryOne<{ value: string }>(SYNC_GROUP_COVERAGE_VALUE_SQL, [syncGroupCoverageKey(groupId)]);
  return readStoredSyncGroupCoverage(row?.value, basis?.restore_id ?? '');
}

export function mergeDesktopSyncGroupCoverage(driver: DatabaseDriver, groupId: string,
  incoming: SyncGroupCoveragePayload | undefined) {
  if (!incoming) return;
  const merged = mergeSyncGroupCoverage(loadDesktopSyncGroupCoverage(driver, groupId), incoming);
  driver.execute(SYNC_GROUP_COVERAGE_SAVE_SQL, [syncGroupCoverageKey(groupId), JSON.stringify(merged), new Date().toISOString()]);
}

/** A member silent past the expiry may only come back by overwriting itself from the group. */
export function isDesktopSyncGroupMemberCurrent(driver: DatabaseDriver, groupId: string, memberId: string,
  incoming?: SyncGroupCoveragePayload) {
  const member = driver.queryAll<SyncGroupMemberRow>(SYNC_GROUP_ACTIVE_MEMBERS_SQL, [groupId])
    .find(row => row.device_identity_key === memberId);
  return isSyncGroupMemberCurrent(loadDesktopSyncGroupCoverage(driver, groupId), incoming, member);
}

export function isDesktopLocalSyncGroupMemberExpired(driver: DatabaseDriver, groupId: string) {
  const local = driver.queryOne<{ local_device_identity_key: string }>(SYNC_GROUP_LOCAL_MEMBER_SQL, [groupId]);
  return Boolean(local) && !isDesktopSyncGroupMemberCurrent(driver, groupId, local!.local_device_identity_key);
}

/** Ordinary rounds need both sides current; an expired side first overwrites itself from the group. */
export function bothMembersCurrent(driver: DatabaseDriver, incoming: SyncGroupMemberStatePayload, senderId: string) {
  return isDesktopSyncGroupMemberCurrent(driver, incoming.group_id, senderId, incoming.coverage) &&
    !isDesktopLocalSyncGroupMemberExpired(driver, incoming.group_id);
}

/** For the sync overview: whether this device must overwrite itself before it can sync again. */
export function loadDesktopLocalSyncGroupMemberExpired(groupId: string) {
  return isDesktopLocalSyncGroupMemberExpired(openDatabaseConnection().driver, groupId);
}
