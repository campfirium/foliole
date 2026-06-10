import type { PersistedImportRecord } from '../../lib/core/import/contract.js';
import { upsertKeepImportItem } from '../database/keepImportItems.js';
import { buildPreparedImportRecord, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import type { KeepImportRuleConfig } from './keepImportService.js';

export function persistKeepImportState(
  config: KeepImportRuleConfig,
  source: DirectoryImportSourceDescriptor,
  sourceSignature: {
    highlight: { mtimeMs: number; sizeBytes: number } | null;
    primary: { mtimeMs: number; sizeBytes: number };
  },
  record: PersistedImportRecord,
  status: 'blocked_deleted' | 'degraded' | 'duplicate' | 'failed' | 'imported',
  hasSourceUpdate: boolean
) {
  upsertKeepImportItem({
    hasSourceUpdate,
    highlightSourceMtimeMs: sourceSignature.highlight?.mtimeMs ?? null,
    highlightSourceSizeBytes: sourceSignature.highlight?.sizeBytes ?? null,
    lastImportedAt: status === 'blocked_deleted' ? null : record.importedAt,
    lastNodeId: record.nodeId,
    lastSeenAt: record.importedAt,
    lastStatus: status,
    localNodeState: status === 'blocked_deleted' ? 'locally_deleted' : record.nodeId ? 'active' : 'not_imported',
    ruleId: config.ruleId,
    sourceMtimeMs: sourceSignature.primary.mtimeMs,
    sourcePath: source.sourceName,
    sourceSizeBytes: sourceSignature.primary.sizeBytes
  });
}

export function persistBlockedKeepImportState(
  config: KeepImportRuleConfig,
  source: DirectoryImportSourceDescriptor,
  sourceSignature: {
    highlight: { mtimeMs: number; sizeBytes: number } | null;
    primary: { mtimeMs: number; sizeBytes: number };
  },
  importedAt: string,
  lastNodeId: string | null,
  hasSourceUpdate: boolean
) {
  const record = createBlockedRecord(source, importedAt, lastNodeId);
  persistKeepImportState(config, source, sourceSignature, record, 'blocked_deleted', hasSourceUpdate);
  return record;
}

function createBlockedRecord(
  source: DirectoryImportSourceDescriptor,
  importedAt: string,
  lastNodeId: string | null
): PersistedImportRecord {
  const prepared = buildPreparedImportRecord(source, {
    content: '',
    importedAt
  });
  return {
    contentFingerprint: prepared.contentFingerprint,
    degradedReason: null,
    duplicateSemantic: 'updated',
    failureReason: 'blocked_deleted',
    importId: `keep-blocked-${prepared.contentFingerprint}`,
    importedAt,
    nodeId: lastNodeId,
    provider: prepared.provider,
    resultStatus: 'failed',
    sourceFingerprint: prepared.sourceFingerprint,
    sourceKind: prepared.sourceKind,
    sourceLocator: prepared.sourceLocator,
    sourceName: prepared.sourceName
  };
}
