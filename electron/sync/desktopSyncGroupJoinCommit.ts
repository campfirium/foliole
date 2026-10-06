import { randomUUID } from 'node:crypto';

import { SYNC_GROUP_LOCAL_ADOPTION_KEY } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import type { SyncGroupJoinGroupInfo } from '../../lib/platform/syncGroupJoinContract.js';
import { parseSyncGroupJoinMode } from '../../lib/platform/syncGroupJoinMode.js';
import { openDatabaseConnection } from '../database/connection.js';
import { publishBackupRestoreEvent } from '../database/syncGroupBackupRestore.js';
import { joinDesktopSyncGroup } from '../database/syncGroupStore.js';
import { loadDesktopDeviceIdentity } from '../deviceAnchorStore.js';

import { resolveDesktopHostName, resolveDesktopPlatformLabel } from './companionLanPayloads.js';
import { saveDesktopSyncGroupPendingJoin, type DesktopSyncGroupPendingJoin } from './desktopSyncGroupJoinState.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';

export async function commitDesktopSyncGroupJoin(pending: DesktopSyncGroupPendingJoin, info: SyncGroupJoinGroupInfo) {
  const mode = parseSyncGroupJoinMode(pending.mode);
  const connection = openDatabaseConnection();
  const { identity } = await loadDesktopDeviceIdentity({ groupId: info.group_id, libraryPath: connection.dbPath });
  const group = connection.driver.transaction((tx) => {
    const joined = joinDesktopSyncGroup({ device: identity, deviceName: resolveDesktopHostName(),
      displayName: info.display_name, platform: resolveDesktopPlatformLabel(), workgroupKey: info.workgroup_key });
    if (mode === 'overwrite') publishBackupRestoreEvent(tx, {
      group_id: joined.group_id, restore_id: `restore-${randomUUID()}`,
      restored_at: new Date().toISOString(), source_device_identity_key: joined.local_device_identity_key
    });
    if (mode === 'use-group') {
      tx.execute('DELETE FROM sync_group_restore_events WHERE group_id = ?', [info.group_id]);
      tx.execute('DELETE FROM node_version_local_source_revisions');
      const libraryEpoch = `adoption-${randomUUID()}`;
      tx.execute(`INSERT INTO sync_group_metadata (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [SYNC_GROUP_LOCAL_ADOPTION_KEY, JSON.stringify({ libraryEpoch, groupId: info.group_id,
        endpointUrl: pending.candidate.endpoint_url, providerDeviceId: pending.candidate.provider_device_id,
        providerDeviceName: pending.candidate.provider_device_name, providerPlatform: pending.candidate.provider_platform }),
        new Date().toISOString()]);
      tx.execute('UPDATE node_version_local_proof_state SET library_epoch = ?, proof_revision = 0 WHERE singleton_id = 1',
        [libraryEpoch]);
    }
    return joined;
  });
  saveDesktopSyncGroupPendingJoin(null);
  return {
    endpoint_url: pending.candidate.endpoint_url, group_id: info.group_id,
    local_device_id: group.local_device_identity_key, peer_device_id: pending.candidate.provider_device_id,
    peer_device_name: pending.candidate.provider_device_name, peer_platform: pending.candidate.provider_platform,
    route_kind: ['android-capacitor', 'ios-capacitor'].includes(pending.candidate.provider_platform.toLowerCase())
      ? 'mobile_guide' : 'anchor'
  } satisfies DesktopSyncGroupPeer;
}
