import { isAssignedSyncGroupDeviceName } from '../../lib/platform/syncGroupDeviceProfile.js';
import { loadOrCreateDesktopInstallationIdentity } from '../desktopInstallationIdentity.js';
import { resolveDesktopDeviceName } from '../sync/companionLanPayloads.js';
import { clearPairedCompanionDevices } from '../sync/companionPairingStore.js';

import type { DatabaseConnection } from './connection.js';
import { updateLocalDesktopSourceHosts } from './desktopSources.js';
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
    const profile = refreshDesktopDeviceProfile({
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
    const currentHost = loadCurrentHost(connection, profile.currentDeviceId);
    updateLocalDesktopSourceHosts({
      currentDeviceId: profile.currentDeviceId,
      currentHostName: currentHost.name,
      currentHostPlatform: currentHost.platform,
      driver: connection.driver,
      installationRef: loadOrCreateDesktopInstallationIdentity().installationId,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    pendingSnapshot.value?.protection.release();
    throw error;
  }
  if (pendingSnapshot.value) {
    settleManagedMigrationSnapshot(pendingSnapshot.value.snapshot, pendingSnapshot.value.protection);
  }
}

function loadCurrentHost(connection: DatabaseConnection, fallback: string) {
  const member = connection.driver.queryOne<{ device_kind: string; device_name: string }>(
    `SELECT m.device_kind, m.device_name FROM sync_group_local_state l
     JOIN sync_group_members m ON m.group_id = l.group_id AND m.device_id = l.local_device_id
     WHERE l.singleton_id = 1 AND l.member_state = 'active' AND m.state = 'active' LIMIT 1`
  );
  return { name: member?.device_name ?? fallback, platform: member?.device_kind ?? process.platform };
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
