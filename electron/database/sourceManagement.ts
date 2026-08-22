import { computeSyncContentHash, upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE } from '../../lib/core/sync/syncObjectPayloadSql.js';
import type {
  NativeSourceManagementAction,
  NativeSourceManagementPreview,
  NativeSourceManagementResult,
  NativeSourceManagementSummary,
  NativeSourceManagementType
} from '../../lib/platform/nativeSourceManagementContract.js';

import { openDatabaseConnection } from './connection.js';
import {
  loadCurrentDesktopHost,
  loadDesktopSource,
  type DesktopSourceRecord
} from './desktopSources.js';

function topicCount(sourceRef: string) {
  return openDatabaseConnection().driver.queryOne<{ count: number }>(
    `SELECT COUNT(DISTINCT latest_node_id) AS count FROM import_sources
     WHERE source_ref = ? AND latest_node_id IS NOT NULL`, [sourceRef]
  )?.count ?? 0;
}

function toSummary(source: DesktopSourceRecord): NativeSourceManagementSummary {
  return {
    root_path: source.root_path,
    source_ref: source.source_ref,
    source_type: source.source_type as NativeSourceManagementType,
    topic_count: topicCount(source.source_ref)
  };
}

function requireManageableSource(sourceRef: string) {
  const source = loadDesktopSource(sourceRef);
  if (!source || (source.source_type !== 'external' && source.source_type !== 'watched')) {
    throw new Error('source_management_source_not_found');
  }
  return source;
}

function sourcesForPreview(
  action: NativeSourceManagementAction,
  sourceRef?: string,
  hostName?: string,
  sourceType?: NativeSourceManagementType
) {
  if (action === 'remove_source') return [requireManageableSource(sourceRef ?? '')];
  if ((sourceType !== 'external' && sourceType !== 'watched') || !hostName?.trim()) {
    throw new Error('source_management_host_required');
  }
  return openDatabaseConnection().driver.queryAll<DesktopSourceRecord>(
    `SELECT source_ref, source_type, config_ref, host_name, host_platform, root_path,
       path_flavor, type_settings_json, updated_at FROM desktop_sources
     WHERE source_type = ? AND host_name = ? ORDER BY source_ref`, [sourceType, hostName.trim()]
  );
}

export function previewSourceManagement(input: {
  action: NativeSourceManagementAction;
  hostName?: string;
  sourceRef?: string;
  sourceType?: NativeSourceManagementType;
}): NativeSourceManagementPreview {
  const sources = sourcesForPreview(input.action, input.sourceRef, input.hostName, input.sourceType).map(toSummary);
  return {
    action: input.action,
    checked_at: new Date().toISOString(),
    current_host_name: loadCurrentDesktopHost().name,
    source_count: sources.length,
    sources,
    topic_count: sources.reduce((total, source) => total + source.topic_count, 0)
  };
}

function recordSourceSync(source: DesktopSourceRecord, now: string, deleted: boolean) {
  const driver = openDatabaseConnection().driver;
  const objectType = source.source_type === 'external' ? 'external_folder' : 'watched_folder';
  const row = driver.queryOne<{ payload_json: string }>(SYNC_OBJECT_PAYLOAD_SQL_BY_TYPE[objectType], [source.config_ref]);
  const payload = deleted
    ? { deleted_at: now, [objectType === 'external_folder' ? 'folder_id' : 'binding_id']: source.config_ref }
    : JSON.parse(row?.payload_json ?? '{}');
  upsertSyncObjectState(driver, {
    contentHash: computeSyncContentHash(objectType, payload), deletedAt: deleted ? now : null,
    lastModifiedByHostName: loadCurrentDesktopHost().name, objectId: source.config_ref,
    objectType, syncDirty: true, updatedAt: now
  });
}

function removeSource(source: DesktopSourceRecord, now: string) {
  const driver = openDatabaseConnection().driver;
  if (source.source_type === 'external') {
    driver.execute('DELETE FROM external_documents WHERE folder_id = ?', [source.config_ref]);
    driver.execute('DELETE FROM external_folder_host_preferences WHERE folder_id = ?', [source.config_ref]);
    driver.execute('DELETE FROM external_search_folders WHERE source_ref = ?', [source.source_ref]);
  } else {
    driver.execute('DELETE FROM watched_folder_bindings WHERE source_ref = ?', [source.source_ref]);
  }
  driver.execute('DELETE FROM desktop_sources WHERE source_ref = ?', [source.source_ref]);
  recordSourceSync(source, now, true);
}

function replaceHost(source: DesktopSourceRecord, now: string) {
  const driver = openDatabaseConnection().driver;
  const host = loadCurrentDesktopHost();
  driver.execute(
    `UPDATE desktop_sources SET host_name = ?, host_platform = ?,
       type_settings_json = json_set(type_settings_json, '$.connectionStatus', 'needs-folder'), updated_at = ?
     WHERE source_ref = ?`, [host.name, host.platform, now, source.source_ref]
  );
  if (source.source_type === 'external') {
    driver.execute("UPDATE external_search_folders SET status = 'idle', updated_at = ? WHERE source_ref = ?",
      [now, source.source_ref]);
  } else {
    driver.execute("UPDATE watched_folder_bindings SET connection_status = 'needs-folder', updated_at = ? WHERE source_ref = ?",
      [now, source.source_ref]);
  }
  recordSourceSync({ ...source, host_name: host.name, host_platform: host.platform }, now, false);
}

export function confirmSourceManagement(input: {
  action: NativeSourceManagementAction;
  hostName?: string;
  sourceRef?: string;
  sourceType?: NativeSourceManagementType;
}): NativeSourceManagementResult {
  const preview = previewSourceManagement(input);
  if (!preview.source_count) throw new Error('source_management_empty');
  const now = new Date().toISOString();
  const sources = preview.sources.map((item) => requireManageableSource(item.source_ref));
  openDatabaseConnection().driver.transaction(() => {
    for (const source of sources) {
      if (input.action === 'remove_source') removeSource(source, now);
      else replaceHost(source, now);
    }
  });
  return {
    action: input.action, changed_source_count: sources.length,
    completed_at: now, topic_count: preview.topic_count
  };
}
