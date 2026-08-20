import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { recordImportSourceSync } from '../../lib/core/database/importPipelineRecords.js';
import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import type { ImportManagerSourceDraft } from '../../lib/core/import/importManagerSettings.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';
import type { NativeWatchedFolderBinding } from '../../lib/platform/nativeWatchedFolderContract.js';

import { openDatabaseConnection } from './connection.js';
import { isDesktopSourceExecutable, loadDesktopSource, loadDesktopSourceByConfig, upsertDesktopSource } from './desktopSources.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';

interface WatchedFolderBindingRow extends DatabaseRow {
  action_mode: string;
  archive_path: string;
  binding_id: string;
  host_name: string;
  host_platform: string;
  connection_status: string;
  created_at: string;
  highlight_mode: string;
  highlight_path: string;
  primary_path: string;
  source_ref: string;
  updated_at: string;
}

function toBinding(row: WatchedFolderBindingRow): NativeWatchedFolderBinding {
  return {
    action_mode: row.action_mode === 'delete' ? 'delete' : 'keep',
    archive_path: row.archive_path,
    binding_id: row.binding_id,
    host_name: row.host_name,
    host_platform: row.host_platform,
    connection_status: row.connection_status === 'connected' ? 'connected' : 'needs-folder',
    created_at: row.created_at,
    highlight_mode: row.highlight_mode === 'split' ? 'split' : 'merged',
    highlight_path: row.highlight_path,
    primary_path: row.primary_path,
    source_ref: row.source_ref,
    updated_at: row.updated_at
  };
}

function localHostProfile(now: string) {
  const driver = openDatabaseConnection().driver;
  const hostName = loadOrCreateDesktopHostName(now);
  const member = driver.queryOne<{ host_name: string; host_platform: string }>(
    `SELECT m.host_name, m.host_platform FROM sync_group_local_state l
     JOIN sync_group_members m ON m.group_id = l.group_id AND m.host_name = l.local_host_name
     WHERE l.singleton_id = 1 AND l.member_state = 'active' AND m.state = 'active' LIMIT 1`
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
    `SELECT b.binding_id, s.host_name, s.host_platform, b.connection_status,
       b.action_mode, b.archive_path, b.highlight_mode, b.highlight_path, b.primary_path, b.source_ref,
       b.created_at, b.updated_at
     FROM watched_folder_bindings b JOIN desktop_sources s ON s.source_ref = b.source_ref
     WHERE b.deleted_at IS NULL ORDER BY b.created_at, b.binding_id`
  ).map(toBinding);
}

export function loadWatchedFolderBindingState() {
  return {
    bindings: loadWatchedFolderBindings(),
    current_host_name: localHostProfile(new Date().toISOString()).hostName
  };
}

export function upsertChangedWatchedFolderSource(source: ImportManagerSourceDraft, now: string) {
  if (!source.primaryPath.trim()) return null;
  const driver = openDatabaseConnection().driver;
  const profile = localHostProfile(now);
  const configuredSource = loadDesktopSourceByConfig('watched', source.id);
  if (configuredSource && configuredSource.host_name !== profile.hostName) return null;
  const existing = driver.queryOne<WatchedFolderBindingRow>(
    `SELECT binding.*, source.host_name, source.host_platform FROM watched_folder_bindings binding
     JOIN desktop_sources source ON source.source_ref = binding.source_ref
     WHERE binding.binding_id = ? OR source.config_ref = ? ORDER BY binding.binding_id = ? DESC LIMIT 1`,
    [source.id, source.id, source.id]
  );
  const existingSource = existing ? loadDesktopSource(existing.source_ref) : null;
  const bindingId = existing?.binding_id ?? source.id;
  const desktopSource = upsertDesktopSource({
    configRef: existingSource?.config_ref ?? source.id,
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
       primary_path, created_at, updated_at, deleted_at, source_ref
     ) VALUES (?, 'connected', ?, ?, ?, ?, ?, ?, ?, NULL, ?)
     ON CONFLICT(binding_id) DO UPDATE SET connection_status = 'connected',
       action_mode = excluded.action_mode, archive_path = excluded.archive_path,
       highlight_mode = excluded.highlight_mode, highlight_path = excluded.highlight_path,
       primary_path = excluded.primary_path, updated_at = excluded.updated_at, deleted_at = NULL,
       source_ref = excluded.source_ref`,
    [bindingId, source.actionMode, source.archivePath,
      source.highlightMode, source.highlightPath.trim(), source.primaryPath.trim(), existing?.created_at ?? now, now,
      desktopSource.source_ref]
  );
  const binding = loadWatchedFolderBindings().find((item) => item.binding_id === bindingId) ?? null;
  if (binding) recordBindingSync(binding);
  return binding;
}

export function resolveExecutableWatchedBinding(ruleId: string, primaryPath: string) {
  const driver = openDatabaseConnection().driver;
  const source = loadDesktopSourceByConfig('watched', ruleId);
  if (!source) return { bindingId: null, executable: false };
  const binding = driver.queryOne<WatchedFolderBindingRow>(
    `SELECT binding.*, source.host_name, source.host_platform FROM watched_folder_bindings binding
     JOIN desktop_sources source ON source.source_ref = binding.source_ref
     WHERE binding.deleted_at IS NULL AND binding.source_ref = ? LIMIT 1`, [source.source_ref]
  );
  if (!binding) return {
    bindingId: null,
    executable: isDesktopSourceExecutable(source) && source.root_path === primaryPath.trim()
  };
  return {
    bindingId: binding.binding_id,
    executable: binding.connection_status === 'connected' && isDesktopSourceExecutable(source) &&
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
  if (current.host_name !== localHostProfile(new Date().toISOString()).hostName) {
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
  if (current.host_name !== localHostProfile(new Date().toISOString()).hostName) {
    throw new Error('watched_folder_not_local');
  }
  const now = new Date().toISOString();
  driver.transaction((tx) => {
    tx.execute('DELETE FROM watched_folder_bindings WHERE binding_id = ?', [bindingId]);
    tx.execute('DELETE FROM desktop_sources WHERE source_ref = ?', [current.source_ref]);
    recordBindingSync(current, now);
  });
}
