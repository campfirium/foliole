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
  try {
    refreshDesktopDeviceProfile({
      clearCredentials: clearPairedCompanionDevices,
      connection,
      currentDeviceId: resolveDesktopDeviceName(),
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
