import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import {
  readStoredSyncGroupCoverage,
  SYNC_GROUP_COVERAGE_BASIS_SQL,
  SYNC_GROUP_COVERAGE_SAVE_SQL,
  SYNC_GROUP_COVERAGE_VALUE_SQL,
  syncGroupCoverageKey
} from '../../lib/core/sync/syncGroupCoverageStore.js';
import { mergeSyncGroupCoverage, type SyncGroupCoveragePayload } from '../../lib/platform/syncGroupCoverageContract.js';

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
