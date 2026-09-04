import { requireResolvedNodeBody, type NodeBodyRow } from '../../lib/core/database/nodeBodyResolution.js';
import type { PersistedImportRecord, PreparedImportRecord } from '../../lib/core/import/contract.js';
import { openDatabaseConnection } from '../database/connection.js';
import type { DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import type { KeepImportRuleConfig } from './keepImportService.js';
import { persistKeepImportState } from './keepImportServiceState.js';

interface ExistingImportSource extends NodeBodyRow {
  latest_node_id: string | null;
}

function readDuplicateNodeId(prepared: PreparedImportRecord) {
  const row = openDatabaseConnection().sqlite
    .prepare(
      `SELECT s.latest_node_id, n.content, n.body_blob_hash, cbd.data AS body_blob_data
       FROM import_sources s
       JOIN nodes n ON n.id = s.latest_node_id
       LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
       WHERE s.source_fingerprint = ?
         AND s.last_content_fingerprint = ?
         AND n.deleted_at IS NULL`
    )
    .get(prepared.sourceFingerprint, prepared.contentFingerprint) as ExistingImportSource | undefined;
  if (row?.latest_node_id) {
    requireResolvedNodeBody(row, row.latest_node_id);
  }
  return row?.latest_node_id ?? null;
}

function createDuplicateNoopRecord(prepared: PreparedImportRecord, nodeId: string): PersistedImportRecord {
  return {
    contentFingerprint: prepared.contentFingerprint,
    degradedReason: null,
    duplicateSemantic: 'duplicate',
    failureReason: null,
    importId: `keep-duplicate-noop-${prepared.contentFingerprint}`,
    importedAt: prepared.importedAt,
    nodeId,
    provider: prepared.provider,
    resultStatus: 'imported',
    sourceFingerprint: prepared.sourceFingerprint,
    sourceKind: prepared.sourceKind,
    sourceLocator: prepared.sourceLocator,
    sourceName: prepared.sourceName
  };
}

function refreshDuplicateImportSourceLocator(record: PersistedImportRecord) {
  openDatabaseConnection().sqlite
    .prepare(
      `UPDATE import_sources
       SET source_locator = ?,
           source_name = ?
       WHERE source_fingerprint = ?
         AND last_content_fingerprint = ?
         AND latest_node_id = ?`
    )
    .run(
      record.sourceLocator,
      record.sourceName,
      record.sourceFingerprint,
      record.contentFingerprint,
      record.nodeId
    );
}

export function persistAutomaticDuplicateNoop(input: {
  config: KeepImportRuleConfig;
  hasSourceUpdate: boolean;
  prepared: PreparedImportRecord;
  source: DirectoryImportSourceDescriptor;
  sourceSignature: {
    highlight: { mtimeMs: number; sizeBytes: number } | null;
    primary: { mtimeMs: number; sizeBytes: number };
  };
}) {
  const nodeId = readDuplicateNodeId(input.prepared);
  if (!nodeId) {
    return null;
  }
  const record = createDuplicateNoopRecord(input.prepared, nodeId);
  refreshDuplicateImportSourceLocator(record);
  persistKeepImportState(input.config, input.source, input.sourceSignature, record, 'duplicate', input.hasSourceUpdate);
  return record;
}
