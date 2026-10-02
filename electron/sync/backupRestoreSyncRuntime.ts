import { app } from 'electron';

import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { reconcileDesktopCompanionSyncRuntime } from './desktopCompanionSyncParticipation.js';
import { stopLanWorkspaceSyncServer } from './lanWorkspaceSyncServer.js';

export async function reconcileBackupRestoreSyncRuntime() {
  try {
    await stopLanWorkspaceSyncServer();
    await runWithDatabaseConnectionOwner(async () => {
      const group = loadDesktopSyncGroup();
      await reconcileDesktopCompanionSyncRuntime({ appVersion: app.getVersion(),
        deviceId: group?.local_device_identity_key ?? 'unavailable' });
    });
  } catch (error) {
    console.warn('[backup] library restored; sync runtime reconciliation failed', error);
  }
}
