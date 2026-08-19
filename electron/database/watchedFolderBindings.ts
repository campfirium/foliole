import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { recordImportSourceSync } from '../../lib/core/database/importPipelineRecords.js';
import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import type { ImportManagerSourceDraft } from '../../lib/core/import/importManagerSettings.js';
import type { NativeWatchedFolderBinding } from '../../lib/platform/nativeWatchedFolderContract.js';
import { loadOrCreateDesktopInstallationIdentity } from '../desktopInstallationIdentity.js';

import { openDatabaseConnection } from './connection.js';
import { loadDesktopSourceByConfig, upsertDesktopSource } from './desktopSources.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';

interface WatchedFolderBindingRow extends DatabaseRow {
  action_mode: string;
  archive_path: string;
  binding_id: string;
  connected_device_id: string | null;
  connected_device_name: string | null;
  connected_platform: string | null;
  connection_status: string;
  created_at: string;
  highlight_mode: string;
  highlight_path: string;
  primary_path: string;
  updated_at: string;
}

function toBinding(row: WatchedFolderBindingRow): NativeWatchedFolderBinding {
  return {
    action_mode: row.action_mode === 'delete' ? 'delete' : 'keep',
    archive_path: row.archive_path,
    binding_id: row.binding_id,
    connected_device_id: row.connected_device_id,
    connected_device_name: row.connected_device_name,
    connected_platform: row.connected_platform,
    connection_status: row.connection_status === 'connected' ? 'connected' : 'needs-folder',
    created_at: row.created_at,
    highlight_mode: row.highlight_mode === 'split' ? 'split' : 'merged',
    highlight_path: row.highlight_path,
    primary_path: row.primary_path,
    updated_at: row.updated_at
  };
}

function localDeviceProfile(now: string) {
  const driver = openDatabaseConnection().driver;
  const deviceId = loadOrCreateDesktopDeviceId(now);
  const member = driver.queryOne<{ device_kind: string; device_name: string }>(
    `SELECT m.device_kind, m.device_name FROM sync_group_local_state l
     JOIN sync_group_members m ON m.group_id = l.group_id AND m.device_id = l.local_device_id
     WHERE l.singleton_id = 1 AND l.member_state = 'active' AND m.state = 'active' LIMIT 1`
  );
  return { deviceId, deviceName: member?.device_name ?? deviceId, platform: member?.device_kind ?? process.platform };
}

function bindingPayload(binding: NativeWatchedFolderBinding) {
  return {
    action_mode: binding.action_mode,
    archive_path: binding.archive_path,
    binding_id: binding.binding_id,
    connected_device_id: binding.connected_device_id,
    connected_device_name: binding.connected_device_name,
    connected_platform: binding.connected_platform,
    connection_status: binding.connection_status,
    created_at: binding.created_at,
    highlight_mode: binding.highlight_mode,
    highlight_path: binding.highlight_path,
    primary_path: binding.primary_path,
    updated_at: binding.updated_at
  };
}

function recordBindingSync(binding: NativeWatchedFolderBinding, deviceId: string, deletedAt?: string) {
  upsertSyncObjectState(openDatabaseConnection().driver, {
    contentHash: computeSyncContentHash('watched_folder', deletedAt
      ? { binding_id: binding.binding_id, deleted_at: deletedAt }
      : bindingPayload(binding)),
    deletedAt: deletedAt ?? null,
    lastModifiedByDeviceId: deviceId,
    objectId: binding.binding_id,
    objectType: 'watched_folder',
    syncDirty: true,
    updatedAt: deletedAt ?? binding.updated_at
  });
}

export function loadWatchedFolderBindings() {
  return openDatabaseConnection().driver.queryAll<WatchedFolderBindingRow>(
    `SELECT b.binding_id, b.connected_device_id, COALESCE(s.host_name, b.connected_device_name) connected_device_name,
       COALESCE(s.host_platform, b.connected_platform) connected_platform, b.connection_status,
       b.action_mode, b.archive_path, b.highlight_mode, b.highlight_path, b.primary_path, b.created_at, b.updated_at
     FROM watched_folder_bindings b LEFT JOIN desktop_sources s ON s.source_ref = b.source_ref
     WHERE b.deleted_at IS NULL ORDER BY b.created_at, b.binding_id`
  ).map(toBinding);
}

export function loadWatchedFolderBindingState() {
  return {
    bindings: loadWatchedFolderBindings(),
    current_device_id: loadOrCreateDesktopDeviceId()
  };
}

export function upsertChangedWatchedFolderSource(source: ImportManagerSourceDraft, now: string) {
  if (!source.primaryPath.trim()) return null;
  const driver = openDatabaseConnection().driver;
  const profile = localDeviceProfile(now);
  const existing = driver.queryOne<WatchedFolderBindingRow>(
    'SELECT * FROM watched_folder_bindings WHERE binding_id IN (?, ?) ORDER BY binding_id = ? DESC LIMIT 1',
    [source.id, `${profile.deviceId}:${source.id}`, source.id]
  );
  const bindingId = existing?.binding_id ?? `${profile.deviceId}:${source.id}`;
  const desktopSource = upsertDesktopSource({
    configRef: source.id,
    rootPath: source.primaryPath,
    sourceType: 'watched',
    typeSettings: { archivePath: source.archivePath, highlightPath: source.highlightPath },
    updatedAt: now
  });
  driver.execute(
    `INSERT INTO watched_folder_bindings (
       binding_id, connected_device_id, connected_device_name, connected_platform, connection_status,
       action_mode, archive_path, highlight_mode, highlight_path, primary_path, created_at, updated_at, deleted_at, source_ref
     ) VALUES (?, ?, ?, ?, 'connected', ?, ?, ?, ?, ?, ?, ?, NULL, ?)
     ON CONFLICT(binding_id) DO UPDATE SET connected_device_id = excluded.connected_device_id,
       connected_device_name = excluded.connected_device_name, connected_platform = excluded.connected_platform,
       connection_status = 'connected', action_mode = excluded.action_mode, archive_path = excluded.archive_path,
       highlight_mode = excluded.highlight_mode, highlight_path = excluded.highlight_path,
       primary_path = excluded.primary_path, updated_at = excluded.updated_at, deleted_at = NULL,
       source_ref = excluded.source_ref`,
    [bindingId, profile.deviceId, profile.deviceName, profile.platform, source.actionMode, source.archivePath,
      source.highlightMode, source.highlightPath.trim(), source.primaryPath.trim(), existing?.created_at ?? now, now,
      desktopSource.source_ref]
  );
  const binding = loadWatchedFolderBindings().find((item) => item.binding_id === bindingId) ?? null;
  if (binding) recordBindingSync(binding, profile.deviceId);
  return binding;
}

export function resolveExecutableWatchedBinding(ruleId: string, primaryPath: string) {
  const driver = openDatabaseConnection().driver;
  const deviceId = loadOrCreateDesktopDeviceId();
  const installationId = loadOrCreateDesktopInstallationIdentity().installationId;
  const source = loadDesktopSourceByConfig('watched', ruleId);
  const binding = driver.queryOne<WatchedFolderBindingRow>(
    `SELECT * FROM watched_folder_bindings
     WHERE deleted_at IS NULL AND binding_id IN (?, ?)
     ORDER BY binding_id = ? DESC LIMIT 1`,
    [ruleId, `${deviceId}:${ruleId}`, ruleId]
  );
  if (!binding) return {
    bindingId: null,
    executable: !source || (
      source.owner_installation_id === installationId && source.root_path === primaryPath.trim()
    )
  };
  return {
    bindingId: binding.binding_id,
    executable: binding.connected_device_id === deviceId && binding.connection_status === 'connected' &&
      source?.owner_installation_id === installationId && source.root_path === primaryPath.trim()
  };
}

export function recordWatchedImportSourceMapping(args: {
  directoryPath: string;
  relativePath: string;
  ruleId: string;
  sourceFingerprint: string;
  updatedAt: string;
}) {
  const binding = resolveExecutableWatchedBinding(args.ruleId, args.directoryPath);
  if (!binding.bindingId || !binding.executable) return;
  const relativePath = args.relativePath.replaceAll('\\', '/').replace(/^\.\//, '');
  if (!relativePath || relativePath === '..' || relativePath.startsWith('../')) return;
  const driver = openDatabaseConnection().driver;
  const source = loadDesktopSourceByConfig('watched', args.ruleId);
  driver.execute(
    `UPDATE import_sources SET watched_binding_id = ?, watched_relative_path = ?, source_ref = ?, source_location = ?
     WHERE source_fingerprint = ?`,
    [binding.bindingId, relativePath, source?.source_ref ?? null, relativePath, args.sourceFingerprint]
  );
  recordImportSourceSync(driver, args.sourceFingerprint, args.updatedAt);
}

export function recordReadwiseImportSourceMapping(args: {
  relativePath: string; ruleId: string; sourceFingerprint: string; updatedAt: string;
}) {
  const source = loadDesktopSourceByConfig('readwise', args.ruleId);
  const relativePath = args.relativePath.replaceAll('\\', '/').replace(/^\.\//u, '');
  if (!source || !relativePath || relativePath === '..' || relativePath.startsWith('../')) return;
  const driver = openDatabaseConnection().driver;
  driver.execute(
    'UPDATE import_sources SET source_ref = ?, source_location = ? WHERE source_fingerprint = ?',
    [source.source_ref, relativePath, args.sourceFingerprint]
  );
  recordImportSourceSync(driver, args.sourceFingerprint, args.updatedAt);
}

export function disconnectWatchedFolderBinding(bindingId: string) {
  const driver = openDatabaseConnection().driver;
  const current = loadWatchedFolderBindings().find((item) => item.binding_id === bindingId);
  if (!current) throw new Error('watched_folder_not_found');
  const now = new Date().toISOString();
  const deviceId = loadOrCreateDesktopDeviceId(now);
  driver.execute(
    `UPDATE watched_folder_bindings SET connection_status = 'needs-folder', updated_at = ?
     WHERE binding_id = ?`, [now, bindingId]
  );
  const updated = loadWatchedFolderBindings().find((item) => item.binding_id === bindingId)!;
  recordBindingSync(updated, deviceId);
  return updated;
}

export function removeWatchedFolderBinding(bindingId: string) {
  const driver = openDatabaseConnection().driver;
  const current = loadWatchedFolderBindings().find((item) => item.binding_id === bindingId);
  if (!current) throw new Error('watched_folder_not_found');
  const now = new Date().toISOString();
  const deviceId = loadOrCreateDesktopDeviceId(now);
  driver.transaction((tx) => {
    tx.execute('DELETE FROM watched_folder_bindings WHERE binding_id = ?', [bindingId]);
    recordBindingSync(current, deviceId, now);
  });
}
