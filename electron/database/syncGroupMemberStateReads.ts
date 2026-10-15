import type { SyncGroupDevicePayload } from '../../lib/platform/syncGroupContract.js';
import type { SyncGroupRemovalDecisionPayload } from '../../lib/platform/syncGroupMemberStateContract.js';
import { eligibleSyncGroupRemovals } from '../../lib/platform/syncGroupRemovalModel.js';

import { openDatabaseConnection } from './connection.js';
type DeviceRow = Omit<SyncGroupDevicePayload, 'contract_version'>;
type RemovalRow = Omit<SyncGroupRemovalDecisionPayload, 'confirmations'>;
type ConfirmationRow = Pick<SyncGroupRemovalDecisionPayload['confirmations'][number],
  'confirming_device_identity_key' | 'kind' | 'confirmed_at'>;

export function loadDevices(groupId: string): SyncGroupDevicePayload[] {
  return openDatabaseConnection().driver.queryAll<DeviceRow>(`SELECT canonical_library_path, device_anchor,
    device_identity_key, device_name, joined_at, last_seen_at, left_at, platform, state, updated_at
    FROM sync_group_devices WHERE group_id = ? ORDER BY joined_at, device_identity_key`, [groupId])
    .map((row) => ({ ...row, contract_version: 1 }));
}

export function loadRemovals(groupId: string): SyncGroupRemovalDecisionPayload[] {
  const driver = openDatabaseConnection().driver;
  return driver.queryAll<RemovalRow>(`SELECT decision_id, target_device_identity_key,
    initiated_by_device_identity_key, created_at, completed_at, superseded_at
    FROM sync_group_removal_decisions WHERE group_id = ? ORDER BY created_at, decision_id`, [groupId])
    .map((row) => ({
      ...row,
      confirmations: driver.queryAll<ConfirmationRow>(`SELECT confirming_device_identity_key, kind, confirmed_at
        FROM sync_group_removal_confirmations WHERE group_id = ? AND decision_id = ?
        ORDER BY confirming_device_identity_key`, [groupId, String(row.decision_id)])
    }));
}

export function completeEligibleRemovals(groupId: string, now: string) {
  const driver = openDatabaseConnection().driver;
  for (const removal of eligibleSyncGroupRemovals(loadDevices(groupId), loadRemovals(groupId))) {
    driver.execute(`UPDATE sync_group_removal_decisions SET completed_at = ?
      WHERE group_id = ? AND decision_id = ? AND completed_at IS NULL`, [now, groupId, removal.decision_id]);
    driver.execute(`UPDATE sync_group_devices SET state = 'left', left_at = COALESCE(left_at, ?), updated_at = ?
      WHERE group_id = ? AND device_identity_key = ?`, [now, now, groupId, removal.target_device_identity_key]);
  }
}
