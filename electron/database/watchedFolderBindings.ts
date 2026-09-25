import { randomUUID } from 'node:crypto';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { recordImportSourceSync } from '../../lib/core/database/importPipelineRecords.js';
import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import type { ImportManagerSourceDraft } from '../../lib/core/import/importManagerSettings.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';
import type { NativeWatchedFolderBinding } from '../../lib/platform/nativeWatchedFolderContract.js';

import { openDatabaseConnection } from './connection.js';
import { isDesktopSourceExecutable, loadDesktopSource, upsertDesktopSource } from './desktopSources.js';
import { loadDesktopDeviceId } from './deviceIdentity.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
import { loadLocalWatchedSourceByRuleId } from './watchedLocalSource.js';

interface WatchedFolderBindingRow extends DatabaseRow {
  action_mode: string;
  archive_path: string;
  binding_id: string;
  host_name: string;
  host_platform: string;
  owner_device_identity_key: string | null;
  connection_status: string;
  created_at: string;
  highlight_mode: string;
  highlight_path: string;
  primary_path: string;
  reported_path: string;
  source_ref: string;
  updated_at: string;
}

function toBinding(row: WatchedFolderBindingRow): NativeWatchedFolderBinding {
  const localId = loadDesktopDeviceId();
  const local = Boolean(localId) && row.owner_device_identity_key === localId;
  return {
    action_mode: row.action_mode === 'delete' ? 'delete' : 'keep',
    archive_path: local ? row.archive_path : '',
    binding_id: row.binding_id,
    host_name: row.host_name,
    host_platform: row.host_platform,
    owner_device_identity_key: row.owner_device_identity_key,
    connection_status: local && row.connection_status === 'connected' ? 'connected' : 'needs-folder',
    created_at: row.created_at,
    highlight_mode: row.highlight_mode === 'split' ? 'split' : 'merged',
    highlight_path: local ? row.highlight_path : '',
    primary_path: local ? row.primary_path : row.reported_path,
    source_ref: row.source_ref,
    updated_at: row.updated_at
  };
}

function localHostProfile(now: string) {
  const driver = openDatabaseConnection().driver;
  const hostName = loadOrCreateDesktopHostName(now);
  const member = driver.queryOne<{ host_name: string; host_platform: string }>(
    `SELECT d.device_name AS host_name, d.platform AS host_platform FROM sync_group_local_state l
     JOIN sync_group_devices d ON d.group_id = l.group_id AND d.device_identity_key = l.local_device_identity_key
     WHERE l.singleton_id = 1 AND l.state = 'active' AND d.state = 'active' LIMIT 1`
  );
  return { hostName: member?.host_name ?? hostName, platform: member?.host_platform ?? process.platform };
}

function recordBindingSync(binding: NativeWatchedFolderBinding, deletedAt?: string) {
  const driver = openDatabaseConnection().driver;
  const row = driver.queryOne<{ payload_json: string }>(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE.watched_folder,
    [binding.binding_id]);
  upsertSyncObjectState(driver, {
    contentHash: computeSyncContentHash('watched_folder', deletedAt
      ? { binding_id: binding.binding_id, deleted_at: deletedAt }
      : JSON.parse(row?.payload_json ?? '{}')),
    deletedAt: deletedAt ?? null,
    lastModifiedByHostName: loadOrCreateDesktopHostName(deletedAt ?? binding.updated_at),
    objectId: binding.binding_id,
    objectType: 'watched_folder',
    syncDirty: true,
    updatedAt: deletedAt ?? binding.updated_at
  });
}

export function loadWatchedFolderBindings() {
  return openDatabaseConnection().driver.queryAll<WatchedFolderBindingRow>(
    `SELECT b.binding_id, s.host_name, s.host_platform, b.owner_device_identity_key, b.connection_status,
       b.action_mode, b.archive_path, b.highlight_mode, b.highlight_path, b.primary_path,
       b.reported_path, b.source_ref,
       b.created_at, b.updated_at
     FROM watched_folder_bindings b JOIN desktop_sources s ON s.source_ref = b.source_ref
     WHERE b.deleted_at IS NULL ORDER BY b.created_at, b.binding_id`
  ).map(toBinding);
}

export function loadWatchedFolderBindingState() {
  return {
    bindings: loadWatchedFolderBindings(),
    current_host_name: localHostProfile(new Date().toISOString()).hostName,
    current_device_identity_key: loadDesktopDeviceId()
  };
}

export function upsertChangedWatchedFolderSource(source: ImportManagerSourceDraft, now: string,
  allowTransfer = false) {
  if (!source.primaryPath.trim()) return null;
  const driver = openDatabaseConnection().driver;
  const profile = localHostProfile(now);
  const localId = loadDesktopDeviceId();
  if (!localId) throw new Error('watched_folder_device_unavailable');
  const existing = driver.queryOne<WatchedFolderBindingRow>(
    `SELECT binding.*, source.host_name, source.host_platform FROM watched_folder_bindings binding
     JOIN desktop_sources source ON source.source_ref = binding.source_ref
     WHERE binding.deleted_at IS NULL AND (binding.binding_id = ? OR binding.local_rule_id = ?)
     ORDER BY binding.binding_id = ? DESC LIMIT 1`,
    [source.id, source.id, source.id]
  );
  if (!allowTransfer && existing && existing.owner_device_identity_key !== localId) return null;
  if (allowTransfer && existing && existing.owner_device_identity_key !== localId &&
    existing.connection_status !== 'needs-folder') {
    throw new Error('watched_folder_owner_must_disconnect');
  }
  const existingSource = existing ? loadDesktopSource(existing.source_ref) : null;
  const bindingId = existing?.binding_id ?? `watched-${randomUUID()}`;
  const desktopSource = upsertDesktopSource({
    configRef: existingSource?.config_ref ?? bindingId,
    hostName: profile.hostName,
    hostPlatform: profile.platform,
    rootPath: source.primaryPath,
    sourceType: 'watched',
    typeSettings: { archivePath: source.archivePath, highlightPath: source.highlightPath },
    updatedAt: now
  });
  driver.execute(
    `INSERT INTO watched_folder_bindings (
       binding_id, connection_status, action_mode, archive_path, highlight_mode, highlight_path,
       primary_path, created_at, updated_at, deleted_at, source_ref, owner_device_identity_key,
       local_rule_id, reported_path
     ) VALUES (?, 'connected', ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
     ON CONFLICT(binding_id) DO UPDATE SET connection_status = 'connected',
       action_mode = excluded.action_mode, archive_path = excluded.archive_path,
       highlight_mode = excluded.highlight_mode, highlight_path = excluded.highlight_path,
       primary_path = excluded.primary_path, updated_at = excluded.updated_at, deleted_at = NULL,
       source_ref = excluded.source_ref,
       owner_device_identity_key = excluded.owner_device_identity_key,
       local_rule_id = excluded.local_rule_id, reported_path = excluded.reported_path`,
    [bindingId, source.actionMode, source.archivePath,
      source.highlightMode, source.highlightPath.trim(), source.primaryPath.trim(), existing?.created_at ?? now, now,
      desktopSource.source_ref, localId, source.id, source.primaryPath.trim()]
  );
  const binding = loadWatchedFolderBindings().find((item) => item.binding_id === bindingId) ?? null;
  if (binding) recordBindingSync(binding);
  return binding;
}

export function resolveExecutableWatchedBinding(ruleId: string, primaryPath: string) {
  const driver = openDatabaseConnection().driver;
  const source = loadLocalWatchedSourceByRuleId(ruleId);
  if (!source) return { bindingId: null, executable: false };
  const binding = driver.queryOne<WatchedFolderBindingRow>(
    `SELECT binding.*, source.host_name, source.host_platform FROM watched_folder_bindings binding
     JOIN desktop_sources source ON source.source_ref = binding.source_ref
     WHERE binding.deleted_at IS NULL AND binding.source_ref = ? LIMIT 1`, [source.source_ref]
  );
  if (!binding) return { bindingId: null, executable: false };
  return {
    bindingId: binding.binding_id,
    executable: Boolean(loadDesktopDeviceId()) &&
      binding.owner_device_identity_key === loadDesktopDeviceId() &&
      binding.connection_status === 'connected' && isDesktopSourceExecutable(source) &&
      source.root_path === primaryPath.trim()
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
  const source = loadLocalWatchedSourceByRuleId(args.ruleId);
  driver.execute(
    `UPDATE import_sources SET watched_binding_id = ?, watched_relative_path = ?, source_ref = ?, source_location = ?
     WHERE source_fingerprint = ?`,
    [binding.bindingId, relativePath, source?.source_ref ?? null, relativePath, args.sourceFingerprint]
  );
  recordImportSourceSync(driver, args.sourceFingerprint, args.updatedAt);
}

export function disconnectWatchedFolderBinding(bindingId: string) {
  const driver = openDatabaseConnection().driver;
  const current = loadWatchedFolderBindings().find((item) => item.binding_id === bindingId);
  if (!current) throw new Error('watched_folder_not_found');
  const localId = loadDesktopDeviceId();
  if (!localId || current.owner_device_identity_key !== localId) {
    throw new Error('watched_folder_not_local');
  }
  const now = new Date().toISOString();
  driver.execute(
    `UPDATE watched_folder_bindings SET connection_status = 'needs-folder', updated_at = ?
     WHERE binding_id = ?`, [now, bindingId]
  );
  const updated = loadWatchedFolderBindings().find((item) => item.binding_id === bindingId)!;
  recordBindingSync(updated);
  return updated;
}

export function removeWatchedFolderBinding(bindingId: string) {
  const driver = openDatabaseConnection().driver;
  const current = loadWatchedFolderBindings().find((item) => item.binding_id === bindingId);
  if (!current) throw new Error('watched_folder_not_found');
  const localId = loadDesktopDeviceId();
  if (!localId || current.owner_device_identity_key !== localId) {
    throw new Error('watched_folder_not_local');
  }
  const now = new Date().toISOString();
  driver.transaction((tx) => {
    tx.execute('DELETE FROM watched_folder_bindings WHERE binding_id = ?', [bindingId]);
    tx.execute('DELETE FROM desktop_sources WHERE source_ref = ?', [current.source_ref]);
    recordBindingSync(current, now);
  });
}
