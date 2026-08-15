import { isAssignedSyncGroupDeviceName } from '../../lib/platform/syncGroupDeviceProfile.js';
import { resolveDesktopDeviceName } from '../sync/companionLanPayloads.js';
import { clearPairedCompanionDevices } from '../sync/companionPairingStore.js';

import type { DatabaseConnection } from './connection.js';
import { refreshDesktopDeviceProfile } from './deviceIdentity.js';
import type { InternalDatabaseSnapshotResult } from './internalSnapshots.js';
import {
  createManagedSafetySnapshotForMigration,
  settleManagedMigrationSnapshot,
  type ManagedSafetySnapshot
} from './managedSafetySnapshots.js';

interface PendingDeviceProfileSnapshot {
  protection: ManagedSafetySnapshot;
  snapshot: InternalDatabaseSnapshotResult;
}

export function refreshHostOwnedDeviceProfile(
  connection: DatabaseConnection,
  previousDeviceId: string | null
) {
  const pendingSnapshot: { value: PendingDeviceProfileSnapshot | null } = { value: null };
  const publicDeviceName = resolveDesktopDeviceName();
  const activeGroupDeviceId = loadActiveGroupDeviceId(connection);
  try {
    refreshDesktopDeviceProfile({
      clearCredentials: clearPairedCompanionDevices,
      connection,
      currentDeviceId: activeGroupDeviceId
        && isAssignedSyncGroupDeviceName(activeGroupDeviceId, publicDeviceName)
        ? activeGroupDeviceId : publicDeviceName,
      previousDeviceId,
      protect: () => {
        pendingSnapshot.value = createManagedSafetySnapshotForMigration({
          reason: 'pre-migration', sourceDatabase: connection.sqlite, sourcePath: connection.dbPath
        });
      }
    });
  } catch (error) {
    pendingSnapshot.value?.protection.release();
    throw error;
  }
  if (pendingSnapshot.value) {
    settleManagedMigrationSnapshot(pendingSnapshot.value.snapshot, pendingSnapshot.value.protection);
  }
}

function loadActiveGroupDeviceId(connection: DatabaseConnection) {
  return connection.driver.queryOne<{ local_device_id: string }>(
    `SELECT local.local_device_id
     FROM sync_group_local_state local
     JOIN sync_group_members member
       ON member.group_id = local.group_id AND member.device_id = local.local_device_id
     WHERE local.singleton_id = 1 AND local.member_state = 'active' AND member.state = 'active'
     LIMIT 1`
  )?.local_device_id ?? null;
}
