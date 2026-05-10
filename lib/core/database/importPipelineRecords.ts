import { randomUUID } from 'node:crypto';

import type {
  ImportDuplicateSemantic,
  PersistedImportRecord,
  PreparedImportRecord
} from '../import/contract.js';

import type { DatabaseDriver } from './driver.js';
import { loadOrCreateDatabaseDeviceId } from './syncDeviceIdentity.js';
import { computeSyncContentHash, upsertSyncObjectState } from './syncState.js';

interface ImportSourceRow {
  [column: string]: unknown;
  availability_state?: string;
  content_fingerprint?: string;
  created_at?: string;
  first_seen_at?: string;
  internal_node_id?: string | null;
  internalized_at?: string | null;
  last_seen_at?: string;
  last_content_fingerprint?: string;
  provider?: string;
  provider_document_id?: string;
  source_id?: string;
  source_fingerprint?: string;
  source_kind?: string;
  source_locator?: string;
  source_name?: string;
  sync_status?: string;
  presentation_state?: string;
  title?: string | null;
  updated_at?: string;
}

interface ExistingNodeRow {
  [column: string]: unknown;
  deleted_at: string | null;
  id: string;
}

export function buildImportRecord(
  prepared: PreparedImportRecord,
  resultStatus: PersistedImportRecord['resultStatus'],
  duplicateSemantic: ImportDuplicateSemantic,
  options: Pick<PersistedImportRecord, 'degradedReason' | 'failureReason' | 'nodeId'>
): PersistedImportRecord {
  return {
    contentFingerprint: prepared.contentFingerprint,
    degradedReason: options.degradedReason,
    duplicateSemantic,
    failureReason: options.failureReason,
    importId: `import-${randomUUID()}`,
    importedAt: prepared.importedAt,
    nodeId: options.nodeId,
    provider: prepared.provider,
    resultStatus,
    sourceFingerprint: prepared.sourceFingerprint,
    sourceKind: prepared.sourceKind,
    sourceLocator: prepared.sourceLocator,
    sourceName: prepared.sourceName
  };
}

export function resolveDuplicateSemantic(
  existingSource: ImportSourceRow | null,
  existingNode: ExistingNodeRow | null,
  contentFingerprint: string
) {
  if (!existingSource || !existingNode || existingNode.deleted_at) {
    return 'new';
  }
  const existingContentFingerprint = existingSource.content_fingerprint ?? existingSource.last_content_fingerprint;
  return existingContentFingerprint === contentFingerprint ? 'duplicate' : 'updated';
}

export function writeImportSource(driver: DatabaseDriver, record: PersistedImportRecord) {
  driver.execute(
    `INSERT INTO document_sources (
       source_id, provider, provider_document_id, source_kind, source_name, source_locator,
       source_fingerprint, content_fingerprint, presentation_state, availability_state, sync_status,
       internal_node_id, internalized_at, title, first_seen_at, last_seen_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_id) DO UPDATE SET
       provider = excluded.provider,
       provider_document_id = excluded.provider_document_id,
       source_name = excluded.source_name,
       source_locator = excluded.source_locator,
       source_kind = excluded.source_kind,
       source_fingerprint = excluded.source_fingerprint,
       content_fingerprint = excluded.content_fingerprint,
       presentation_state = excluded.presentation_state,
       availability_state = excluded.availability_state,
       sync_status = excluded.sync_status,
       internal_node_id = excluded.internal_node_id,
       internalized_at = COALESCE(document_sources.internalized_at, excluded.internalized_at),
       title = excluded.title,
       last_seen_at = excluded.last_seen_at,
       updated_at = excluded.updated_at`,
    [
      record.sourceFingerprint,
      record.provider,
      record.sourceFingerprint,
      record.sourceKind,
      record.sourceName,
      record.sourceLocator,
      record.sourceFingerprint,
      record.contentFingerprint,
      record.nodeId ? 'internal' : 'external',
      'available',
      'synced',
      record.nodeId,
      record.nodeId ? record.importedAt : null,
      record.sourceName,
      record.importedAt,
      record.importedAt,
      record.importedAt,
      record.importedAt
    ]
  );
  recordImportSourceSync(driver, record.sourceFingerprint, record.importedAt);
}

function toImportSourcePayload(row: ImportSourceRow) {
  return {
    availability_state: row.availability_state ?? 'available',
    content_fingerprint: row.content_fingerprint ?? row.last_content_fingerprint ?? '',
    created_at: row.created_at ?? '',
    first_seen_at: row.first_seen_at ?? '',
    internal_node_id: row.internal_node_id,
    internalized_at: row.internalized_at ?? null,
    last_seen_at: row.last_seen_at ?? '',
    presentation_state: row.presentation_state ?? 'external',
    provider: row.provider ?? '',
    provider_document_id: row.provider_document_id ?? '',
    source_id: row.source_id ?? '',
    source_fingerprint: row.source_fingerprint ?? '',
    source_kind: row.source_kind ?? '',
    source_locator: row.source_locator ?? '',
    source_name: row.source_name ?? '',
    sync_status: row.sync_status ?? 'idle',
    title: row.title ?? null,
    updated_at: row.updated_at ?? ''
  };
}

export function recordImportSourceSync(driver: DatabaseDriver, sourceFingerprint: string, updatedAt: string) {
  const row = driver.queryOne<ImportSourceRow>(
    `SELECT
       source_id,
       provider_document_id,
       source_fingerprint,
       provider,
       source_kind,
       source_name,
       source_locator,
       content_fingerprint,
       presentation_state,
       availability_state,
       sync_status,
       internal_node_id,
       internalized_at,
       title,
       first_seen_at,
       last_seen_at,
       created_at,
       updated_at
     FROM document_sources
     WHERE source_id = ?`,
    [sourceFingerprint]
  );
  if (!row) {
    return;
  }
  const payload = toImportSourcePayload(row);
  const contentHash = computeSyncContentHash('document_source', payload);
  const deviceId = loadOrCreateDatabaseDeviceId(driver, updatedAt);
  upsertSyncObjectState(driver, {
    objectType: 'document_source',
    objectId: sourceFingerprint,
    contentHash,
    lastModifiedByDeviceId: deviceId,
    updatedAt,
    syncDirty: true
  });
}

export function writeImportEvent(driver: DatabaseDriver, record: PersistedImportRecord) {
  driver.execute(
    `INSERT INTO import_runs (
       id, source_fingerprint, provider, source_kind, source_name, source_locator,
       content_fingerprint, duplicate_semantic, result_status, node_id,
       imported_at, degraded_reason, failure_reason
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.importId,
      record.sourceFingerprint,
      record.provider,
      record.sourceKind,
      record.sourceName,
      record.sourceLocator,
      record.contentFingerprint,
      record.duplicateSemantic,
      record.resultStatus,
      record.nodeId,
      record.importedAt,
      record.degradedReason,
      record.failureReason
    ]
  );
}
