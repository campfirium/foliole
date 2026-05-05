import { randomUUID } from 'node:crypto';

import type {
  ImportDuplicateSemantic,
  PersistedImportRecord,
  PreparedImportRecord
} from '../import/contract.js';

import type { DatabaseDriver } from './driver.js';

interface ImportSourceRow {
  [column: string]: unknown;
  latest_node_id: string | null;
  last_content_fingerprint: string;
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

export function resolveDuplicateSemantic(existingSource: ImportSourceRow | null, contentFingerprint: string) {
  if (!existingSource) {
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
