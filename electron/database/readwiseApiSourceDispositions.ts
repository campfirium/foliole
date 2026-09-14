import type { DatabaseDriver } from '../../lib/core/database/driver.js';

import type { SourceDisposition, SourceDispositionKey } from './sourceDispositionStates.js';

const API_SCOPE_PREFIX = 'api/';

export function readwiseApiSourceScope(connectionRef: string, documentId: string) {
  return `${API_SCOPE_PREFIX}${encodeURIComponent(connectionRef)}/${encodeURIComponent(documentId)}`;
}

export function isReadwiseApiSourceScope(value: string) {
  return value.startsWith(API_SCOPE_PREFIX);
}

export function readReadwiseApiSourceDisposition(
  driver: DatabaseDriver,
  connectionRef: string,
  documentId: string
) {
  return driver.queryOne<{ disposition: SourceDisposition }>(
    `SELECT disposition FROM source_disposition_states
     WHERE source_kind = 'readwise' AND source_scope = ? LIMIT 1`,
    [readwiseApiSourceScope(connectionRef, documentId)]
  )?.disposition ?? null;
}

export function clearReadwiseApiSourceDisposition(
  driver: DatabaseDriver,
  connectionRef: string,
  documentId: string
) {
  driver.execute(
    "DELETE FROM source_disposition_states WHERE source_kind = 'readwise' AND source_scope = ?",
    [readwiseApiSourceScope(connectionRef, documentId)]
  );
}

export function writeReadwiseApiSourceDisposition(
  driver: DatabaseDriver,
  connectionRef: string,
  documentId: string,
  originalTitle: string,
  disposition: SourceDisposition,
  updatedAt: string
) {
  const scope = readwiseApiSourceScope(connectionRef, documentId);
  driver.execute(
    "DELETE FROM source_disposition_states WHERE source_kind = 'readwise' AND source_scope = ?",
    [scope]
  );
  driver.execute(
    `INSERT INTO source_disposition_states
       (source_kind, source_scope, original_title, disposition, updated_at)
     VALUES ('readwise', ?, ?, ?, ?)`,
    [scope, originalTitle, disposition, updatedAt]
  );
}

export function migrateReadwiseApiSourceDisposition(
  driver: DatabaseDriver,
  legacyKey: SourceDispositionKey,
  connectionRef: string,
  documentId: string,
  disposition: SourceDisposition,
  updatedAt: string
) {
  writeReadwiseApiSourceDisposition(
    driver, connectionRef, documentId, legacyKey.originalTitle, disposition, updatedAt
  );
  driver.execute(
    `DELETE FROM source_disposition_states
     WHERE source_kind = ? AND source_scope = ? AND original_title = ?`,
    [legacyKey.sourceKind, legacyKey.sourceScope, legacyKey.originalTitle]
  );
}

export function recordReadwiseApiNodeDisposition(
  driver: DatabaseDriver,
  nodeId: string,
  disposition: SourceDisposition,
  updatedAt: string
) {
  const row = driver.queryOne<{ remote_connection_ref: string; remote_document_id: string; title: string }>(
    `SELECT i.remote_connection_ref, i.remote_document_id, n.title
     FROM import_sources i JOIN nodes n ON n.id = i.latest_node_id
     WHERE i.remote_provider = 'readwise' AND i.latest_node_id = ?
       AND i.remote_connection_ref IS NOT NULL AND i.remote_document_id IS NOT NULL
     LIMIT 1`,
    [nodeId]
  );
  if (!row) return false;
  writeReadwiseApiSourceDisposition(
    driver, row.remote_connection_ref, row.remote_document_id, row.title, disposition, updatedAt
  );
  return true;
}

export function clearReadwiseApiNodeDisposition(driver: DatabaseDriver, nodeId: string) {
  const rows = driver.queryAll<{ remote_connection_ref: string; remote_document_id: string }>(
    `SELECT remote_connection_ref, remote_document_id FROM import_sources
     WHERE remote_provider = 'readwise' AND latest_node_id = ?
       AND remote_connection_ref IS NOT NULL AND remote_document_id IS NOT NULL`,
    [nodeId]
  );
  for (const row of rows) {
    clearReadwiseApiSourceDisposition(driver, row.remote_connection_ref, row.remote_document_id);
  }
}
