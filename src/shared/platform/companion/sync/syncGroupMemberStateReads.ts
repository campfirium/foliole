import { forgetDepartedExternalFoldersWithDbPort } from '../../../../../lib/core/database/externalFolderRetirement';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type { SyncGroupDevicePayload } from '../../../../../lib/platform/syncGroupContract';
import type { SyncGroupRemovalDecisionPayload } from '../../../../../lib/platform/syncGroupMemberStateContract';
import { eligibleSyncGroupRemovals } from '../../../../../lib/platform/syncGroupRemovalModel';

type DeviceRow = Omit<SyncGroupDevicePayload, 'contract_version'>;
type RemovalRow = Omit<SyncGroupRemovalDecisionPayload, 'confirmations'>;
type ConfirmationRow = Pick<SyncGroupRemovalDecisionPayload['confirmations'][number],
  'confirming_device_identity_key' | 'kind' | 'confirmed_at'>;

export async function loadDevices(db: DbPort, groupId: string): Promise<SyncGroupDevicePayload[]> {
  const rows = await db.query<DeviceRow>(`SELECT canonical_library_path, device_anchor,
    device_identity_key, device_name, joined_at, last_seen_at, left_at, platform, state, updated_at
    FROM sync_group_devices WHERE group_id = ? ORDER BY joined_at, device_identity_key`, [groupId]);
  return rows.map((row) => ({ ...row, contract_version: 1 }));
}

export async function loadRemovals(db: DbPort, groupId: string): Promise<SyncGroupRemovalDecisionPayload[]> {
  const rows = await db.query<RemovalRow>(`SELECT decision_id, target_device_identity_key,
    initiated_by_device_identity_key, created_at, completed_at, superseded_at
    FROM sync_group_removal_decisions WHERE group_id = ? ORDER BY created_at, decision_id`, [groupId]);
  return Promise.all(rows.map(async (row) => ({ ...row, confirmations: await db.query<ConfirmationRow>(
    `SELECT confirming_device_identity_key, kind, confirmed_at
     FROM sync_group_removal_confirmations WHERE group_id = ? AND decision_id = ?
     ORDER BY confirming_device_identity_key`, [groupId, String(row.decision_id)]
  ) })));
}

export async function completeEligibleRemovals(db: DbPort, groupId: string, now: string) {
  const removals = eligibleSyncGroupRemovals(await loadDevices(db, groupId), await loadRemovals(db, groupId));
  for (const removal of removals) {
    await db.run(`UPDATE sync_group_removal_decisions SET completed_at = ?
      WHERE group_id = ? AND decision_id = ? AND completed_at IS NULL`, [now, groupId, removal.decision_id]);
    await db.run(`UPDATE sync_group_devices SET state = 'left', left_at = COALESCE(left_at, ?), updated_at = ?
      WHERE group_id = ? AND device_identity_key = ?`, [now, now, groupId, removal.target_device_identity_key]);
  }
  await forgetDepartedExternalFoldersWithDbPort(db, groupId, now);
}
