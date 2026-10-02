import { loadBackupRestorePendingSync, saveBackupRestorePendingSync } from '../database/backupRestorePendingSync.js';
import { openDatabaseConnection } from '../database/connection.js';
import { publishBackupRestoreEvent, writeRestoreSyncParticipation } from '../database/syncGroupBackupRestore.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import {
  isDesktopCompanionSyncParticipating,
  setDesktopCompanionSyncEnabled,
  setDesktopCompanionSyncPaused
} from './desktopCompanionSyncPreference.js';
import {
  ensureLanWorkspaceSyncServer,
  stopLanWorkspaceSyncServer
} from './lanWorkspaceSyncServer.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

interface DesktopSyncRuntimeIdentity {
  appVersion: string;
  deviceId: string;
}

export function assertDesktopCompanionSyncParticipating() {
  if (!isDesktopCompanionSyncParticipating()) {
    throw new Error('sync_participation_inactive');
  }
}

export async function reconcileDesktopCompanionSyncRuntime(
  identity: DesktopSyncRuntimeIdentity
) {
  return isDesktopCompanionSyncParticipating() && hasCurrentWorkgroupSecurity()
    ? ensureLanWorkspaceSyncServer(identity)
    : stopLanWorkspaceSyncServer();
}

export function enableDesktopCompanionSync(identity: DesktopSyncRuntimeIdentity) {
  setDesktopCompanionSyncEnabled(true);
  return reconcileDesktopCompanionSyncRuntime(identity);
}

export function disableDesktopCompanionSync() {
  setDesktopCompanionSyncEnabled(false);
  return stopLanWorkspaceSyncServer();
}

export function pauseDesktopCompanionSync() {
  setDesktopCompanionSyncPaused(true);
  return stopLanWorkspaceSyncServer();
}

export function resumeDesktopCompanionSync(identity: DesktopSyncRuntimeIdentity, confirmedRestoreId?: string) {
  const driver = openDatabaseConnection().driver;
  const pending = loadBackupRestorePendingSync(driver);
  if (pending) {
    const group = loadDesktopSyncGroup();
    if (confirmedRestoreId !== pending.restoreId) throw new Error('backup_restore_sync_confirmation_required');
    if (!group || group.group_id !== pending.groupId) throw new Error('backup_restore_sync_group_changed');
    driver.transaction((tx) => {
      publishBackupRestoreEvent(tx, { group_id: pending.groupId, restore_id: pending.restoreId,
        restored_at: new Date().toISOString(), source_device_identity_key: group.local_device_identity_key });
      saveBackupRestorePendingSync(tx, null);
      writeRestoreSyncParticipation(tx, false, true);
    });
  } else setDesktopCompanionSyncPaused(false);
  return reconcileDesktopCompanionSyncRuntime(identity);
}

export function activateDesktopCompanionSync(identity: DesktopSyncRuntimeIdentity) {
  if (loadBackupRestorePendingSync()) throw new Error('backup_restore_sync_confirmation_required');
  setDesktopCompanionSyncEnabled(true);
  setDesktopCompanionSyncPaused(false);
  return ensureLanWorkspaceSyncServer(identity);
}

function hasCurrentWorkgroupSecurity() {
  const group = loadDesktopSyncGroup();
  return Boolean(group && loadDesktopWorkgroupKey(group.group_id));
}
