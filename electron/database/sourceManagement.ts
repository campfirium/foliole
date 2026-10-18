import { retireExternalFolder } from '../../lib/core/database/externalFolderRetirement.js';
import { upsertExternalResourceSyncState } from '../../lib/core/database/externalResourceSyncState.js';
import { computeSyncContentHash, type SyncObjectStateInput,
  upsertSyncObjectState } from '../../lib/core/database/syncState.js';
import { buildCanonicalSyncTombstone } from '../../lib/core/sync/canonicalSyncTombstone.js';
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
import { loadDesktopDeviceId } from './deviceIdentity.js';
import { isLocalExternalFolder } from './externalSearchFolderIdentity.js';
import { loadHistoricalRefsForWatchedBinding,
  resolveWatchedHistoricalSourceRef } from './watchedHistoricalSourceMapping.js';

function topicCount(sourceRef: string) {
  if (resolveWatchedHistoricalSourceRef(sourceRef) !== sourceRef) return 0;
  const refs = sourceRef.startsWith('watched:')
    ? [sourceRef, ...loadHistoricalRefsForWatchedBinding(sourceRef.slice('watched:'.length))]
    : [sourceRef];
  return openDatabaseConnection().driver.queryOne<{ count: number }>(
    `SELECT COUNT(DISTINCT latest_node_id) AS count FROM import_sources
     WHERE source_ref IN (${refs.map(() => '?').join(',')}) AND latest_node_id IS NOT NULL`, refs
  )?.count ?? 0;
}

function toSummary(source: DesktopSourceRecord): NativeSourceManagementSummary {
  const owner = source.source_type === 'watched'
    ? openDatabaseConnection().driver.queryOne<{ owner_device_identity_key: string | null }>(
      'SELECT owner_device_identity_key FROM watched_folder_bindings WHERE source_ref = ?', [source.source_ref]
    )?.owner_device_identity_key : null;
  const localId = loadDesktopDeviceId();
  return {
    root_path: source.source_type === 'watched' && (!localId || owner !== localId)
      ? '' : source.root_path,
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
  if (source.source_type === 'external' && !isLocalExternalFolder(source)) {
    throw new Error('external_folder_not_local');
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
  void hostName;
  if (sourceType === 'watched') throw new Error('watched_host_replacement_requires_source_reconnect');
  throw new Error('external_folder_transfer_not_supported');
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
    ? objectType === 'external_folder'
      ? buildCanonicalSyncTombstone(source.config_ref)
      : { deleted_at: now, binding_id: source.config_ref }
    : JSON.parse(row?.payload_json ?? '{}');
  const state: SyncObjectStateInput = {
    contentHash: computeSyncContentHash(objectType, payload), deletedAt: deleted ? now : null,
    lastModifiedByHostName: loadCurrentDesktopHost().name, objectId: source.config_ref,
    objectType, syncDirty: true, updatedAt: now
  };
  if (objectType === 'external_folder') upsertExternalResourceSyncState(driver, {
    ...state, objectType
  });
  else upsertSyncObjectState(driver, state);
}

function removeSource(source: DesktopSourceRecord, now: string) {
  const driver = openDatabaseConnection().driver;
  if (source.source_type === 'external') {
    retireExternalFolder(driver, source.config_ref, now, loadCurrentDesktopHost().name);
    return;
  } else {
    driver.execute('DELETE FROM watched_folder_bindings WHERE source_ref = ?', [source.source_ref]);
  }
  driver.execute('DELETE FROM desktop_sources WHERE source_ref = ?', [source.source_ref]);
  recordSourceSync(source, now, true);
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
      removeSource(source, now);
    }
  });
  return {
    action: input.action, changed_source_count: sources.length,
    completed_at: now, topic_count: preview.topic_count
  };
}
