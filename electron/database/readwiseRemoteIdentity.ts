import { randomUUID } from 'node:crypto';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { recordImportSourceSync } from '../../lib/core/database/importPipelineRecords.js';
import { READWISE_HOST_SETTINGS_KEY, type ReadwiseHostSettings } from '../../lib/core/import/readwiseHostSettings.js';
import {
  normalizeReadwiseRemoteSource,
  READWISE_REMOTE_SOURCE_KEY,
  READWISE_REMOTE_SOURCE_VERSION,
  type ReadwiseRemoteAnnotationBinding,
  type ReadwiseRemoteSource
} from '../../lib/core/readwise/readwiseRemoteIdentity.js';

import { openDatabaseConnection } from './connection.js';
import { loadJsonSetting, writeJsonSetting } from './settingsStore.js';

export interface ConfirmedReadwiseIdentityBinding {
  annotations: ReadwiseRemoteAnnotationBinding[];
  remoteDocumentId: string;
  sourceFingerprint: string;
}

export function loadReadwiseRemoteSource() {
  return normalizeReadwiseRemoteSource(loadJsonSetting(READWISE_REMOTE_SOURCE_KEY));
}

export function createReadwiseRemoteSource(now = new Date().toISOString()): ReadwiseRemoteSource {
  return {
    connectionRef: `readwise-${randomUUID()}`,
    createdAt: now,
    updatedAt: now,
    version: READWISE_REMOTE_SOURCE_VERSION
  };
}

export function ensureReadwiseRemoteSource(replace = false, now = new Date().toISOString()) {
  const current = loadReadwiseRemoteSource();
  if (current && !replace) return current;
  const next = createReadwiseRemoteSource(now);
  openDatabaseConnection().driver.transaction((driver) => {
    writeJsonSetting(driver, READWISE_REMOTE_SOURCE_KEY, next, now);
  });
  return next;
}

export function saveReadwiseConnectionState(
  hostSettings: ReadwiseHostSettings,
  remoteSource: ReadwiseRemoteSource | undefined,
  now: string
) {
  openDatabaseConnection().driver.transaction((driver) => {
    writeJsonSetting(driver, READWISE_HOST_SETTINGS_KEY, hostSettings, now);
    if (remoteSource) writeJsonSetting(driver, READWISE_REMOTE_SOURCE_KEY, remoteSource, now);
  });
}

export function loadReadwiseRemoteDocumentIds(connectionRef: string, limit = 3) {
  return openDatabaseConnection().driver.queryAll<{ remote_document_id: string }>(
    `SELECT remote_document_id FROM import_sources
     WHERE remote_provider = 'readwise' AND remote_connection_ref = ? AND remote_document_id IS NOT NULL
     ORDER BY last_imported_at DESC LIMIT ?`,
    [connectionRef, limit]
  ).map((row) => row.remote_document_id);
}

export function confirmReadwiseIdentityBindings(
  connectionRef: string,
  bindings: ConfirmedReadwiseIdentityBinding[],
  now = new Date().toISOString()
) {
  const driver = openDatabaseConnection().driver;
  driver.transaction((tx) => {
    requireCurrentConnection(tx, connectionRef);
    for (const binding of bindings) writeBinding(tx, connectionRef, binding, now);
  });
}

function requireCurrentConnection(driver: DatabaseDriver, connectionRef: string) {
  const row = driver.queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [READWISE_REMOTE_SOURCE_KEY]);
  let source: ReadwiseRemoteSource | null = null;
  try { source = normalizeReadwiseRemoteSource(JSON.parse(row?.value ?? 'null')); } catch { /* rejected below */ }
  if (source?.connectionRef !== connectionRef) throw new Error('readwise_remote_connection_changed');
}

function writeBinding(
  driver: DatabaseDriver,
  connectionRef: string,
  binding: ConfirmedReadwiseIdentityBinding,
  now: string
) {
  const annotationsJson = JSON.stringify(binding.annotations);
  const changed = driver.execute(
    `UPDATE import_sources SET remote_provider = 'readwise', remote_connection_ref = ?,
       remote_document_id = ?, remote_annotations_json = ?
     WHERE source_fingerprint = ? AND latest_node_id IS NOT NULL`,
    [connectionRef, binding.remoteDocumentId, annotationsJson, binding.sourceFingerprint]
  );
  if (changed.changes !== 1) throw new Error('readwise_binding_source_missing');
  recordImportSourceSync(driver, binding.sourceFingerprint, now);
}
