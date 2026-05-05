import { randomUUID } from 'node:crypto';

import type {
  ImportDuplicateSemantic,
  PersistedImportRecord,
  PreparedImportRecord
} from '../import/contract.js';

import type { DatabaseDriver } from './driver.js';
import { loadOrCreateDatabaseDeviceId } from './syncDeviceIdentity.js';
import { appendSyncChangeLog, computeSyncContentHash, upsertSyncObjectState } from './syncState.js';

interface ImportSourceRow {
  [column: string]: unknown;
  first_imported_at?: string;
  latest_node_id: string | null;
  last_content_fingerprint: string;
  last_imported_at?: string;
  provider?: string;
  source_fingerprint?: string;
  source_kind?: string;
  source_locator?: string;
  source_name?: string;
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
  return existingSource.last_content_fingerprint === contentFingerprint ? 'duplicate' : 'updated';
}

export function writeImportSource(driver: DatabaseDriver, record: PersistedImportRecord) {
  driver.execute(
    `INSERT INTO import_sources (
       source_fingerprint, provider, source_kind, source_name, source_locator,
       first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_fingerprint) DO UPDATE SET
       source_name = excluded.source_name,
       source_locator = excluded.source_locator,
       source_kind = excluded.source_kind,
       last_imported_at = excluded.last_imported_at,
       last_content_fingerprint = excluded.last_content_fingerprint,
       latest_node_id = excluded.latest_node_id`,
    [
      record.sourceFingerprint,
      record.provider,
      record.sourceKind,
      record.sourceName,
      record.sourceLocator,
      record.importedAt,
      record.importedAt,
      record.contentFingerprint,
      record.nodeId
    ]
  );
  recordImportSourceSync(driver, record.sourceFingerprint, record.importedAt);
}

function toImportSourcePayload(row: ImportSourceRow) {
  return {
    firstImportedAt: row.first_imported_at ?? '',
    lastContentFingerprint: row.last_content_fingerprint,
    lastImportedAt: row.last_imported_at ?? '',
    latestNodeId: row.latest_node_id,
    provider: row.provider ?? '',
    sourceFingerprint: row.source_fingerprint ?? '',
    sourceKind: row.source_kind ?? '',
    sourceLocator: row.source_locator ?? '',
    sourceName: row.source_name ?? ''
  };
}

export function recordImportSourceSync(driver: DatabaseDriver, sourceFingerprint: string, updatedAt: string) {
  const row = driver.queryOne<ImportSourceRow>(
    `SELECT
       source_fingerprint,
       provider,
       source_kind,
       source_name,
       source_locator,
       first_imported_at,
       last_imported_at,
       last_content_fingerprint,
       latest_node_id
     FROM import_sources
     WHERE source_fingerprint = ?`,
    [sourceFingerprint]
  );
  if (!row) {
    return;
  }
  const payload = toImportSourcePayload(row);
  const contentHash = computeSyncContentHash('import_source', payload);
  const deviceId = loadOrCreateDatabaseDeviceId(driver, updatedAt);
  upsertSyncObjectState(driver, {
    objectType: 'import_source',
    objectId: sourceFingerprint,
    contentHash,
    lastModifiedByDeviceId: deviceId,
    updatedAt,
    syncDirty: true
  });
  appendSyncChangeLog(driver, {
    changeId: randomUUID(),
    objectType: 'import_source',
    objectId: sourceFingerprint,
    changeType: 'upsert',
    deviceId,
    contentHash,
    payloadJson: JSON.stringify(payload),
    createdAt: updatedAt,
    appliedAt: updatedAt
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
