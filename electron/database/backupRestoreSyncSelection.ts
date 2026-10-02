import Database from 'better-sqlite3';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { parseBackupRestoreSyncChoice, type BackupRestoreSyncChoice } from '../../lib/platform/backupRestoreSyncContract.js';
import { loadDesktopDeviceIdentity } from '../deviceAnchorStore.js';

import { saveBackupRestorePendingSync } from './backupRestorePendingSync.js';
import { buildBackupRestoreSyncPreview } from './backupRestoreSyncPreview.js';
import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { captureBackupRestoreHostSettings, captureCurrentSyncGroupForBackupRestore,
  type GroupSnapshot, writeRestoreSyncParticipation, applyBackupRestoreHostSettings } from './syncGroupBackupRestore.js';

export async function selectBackupRestoreSync(args: {
  sourcePath: string; databasePath: string; targetPath: string;
  current: DatabaseDriver; choice?: BackupRestoreSyncChoice;
}) {
  const sqlite = new Database(args.databasePath, { readonly: true, fileMustExist: true });
  try {
    const backup = createBetterSqlite3Driver(sqlite);
    const preview = await buildBackupRestoreSyncPreview(args.databasePath, backup, args.current);
    const choice = args.choice ? parseBackupRestoreSyncChoice(args.choice) : null;
    if (choice && choice.revision !== preview.revision) throw new Error('backup_restore_sync_settings_changed');
    if (!choice && (!preview.same || preview.current.group)) throw new Error('backup_restore_sync_choice_required');
    const useBackup = !preview.same && choice?.source === 'backup';
    const source = useBackup ? backup : args.current;
    const selected = captureCurrentSyncGroupForBackupRestore(source);
    if ((selected && choice?.action === 'local') || (!selected && choice && choice.action !== 'local')) {
      throw new Error('backup_restore_sync_action_invalid');
    }
    if (!selected) return { snapshot: null, mode: 'local' as const, host: captureBackupRestoreHostSettings(args.current) };
    const current = captureCurrentSyncGroupForBackupRestore(args.current);
    const snapshot = { ...selected, ...captureBackupRestoreHostSettings(args.current) };
    if (useBackup) await bindBackupGroupToCurrentHost(snapshot, current, args.targetPath);
    return { snapshot, host: captureBackupRestoreHostSettings(args.current), mode: choice?.action === 'pause' ? 'pause' as const : 'overwrite' as const };
  } finally { sqlite.close(); }
}

async function bindBackupGroupToCurrentHost(snapshot: GroupSnapshot, current: GroupSnapshot | null,
  targetPath: string) {
  const groupId = String(snapshot.group.group_id);
  if (current && current.group.group_id === groupId) {
    snapshot.local = current.local;
    const local = current.rows.sync_group_devices.find((row) =>
      row.device_identity_key === current.local.local_device_identity_key);
    if (local) snapshot.rows.sync_group_devices = snapshot.rows.sync_group_devices.filter((row) =>
      row.device_identity_key !== local.device_identity_key).concat(local);
    return;
  }
  const { identity } = await loadDesktopDeviceIdentity({ groupId, libraryPath: targetPath });
  snapshot.local = { singleton_id: 1, group_id: groupId,
    local_device_identity_key: identity.identity_key, state: 'active', updated_at: new Date().toISOString() };
  const oldLocal = current?.rows.sync_group_devices.find((row) =>
    row.device_identity_key === current.local.local_device_identity_key);
  const now = new Date().toISOString();
  snapshot.rows.sync_group_devices = snapshot.rows.sync_group_devices.filter((row) =>
    row.device_identity_key !== identity.identity_key).concat({ group_id: groupId,
    device_identity_key: identity.identity_key, device_anchor: identity.device_anchor,
    canonical_library_path: identity.canonical_library_path, device_name: oldLocal?.device_name ?? 'Desktop',
    platform: oldLocal?.platform ?? process.platform, state: 'active', joined_at: now, updated_at: now,
    left_at: null, last_seen_at: null });
}

export function finishLocalOnlyBackupRestore(driver: DatabaseDriver, host: ReturnType<typeof captureBackupRestoreHostSettings>) {
  driver.transaction((tx) => {
    tx.execute('DELETE FROM sync_group_local_state');
    applyBackupRestoreHostSettings(tx, host);
    saveBackupRestorePendingSync(tx, null);
    writeRestoreSyncParticipation(tx, true, false);
  });
}
