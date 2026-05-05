import type { ImportHighlightPolicy, PersistedImportRecord } from '../../lib/core/import/contract.js';
import type { NativeKeepImportPreviewResult } from '../../lib/platform/nativeImportContract.js';
import { recordPreparedImportFailure, runPreparedImport } from '../database/importPipeline.js';
import { readKeepImportItem, readKeepImportNodeState, upsertKeepImportItem } from '../database/keepImportItems.js';
import {
  buildPreparedImportRecord,
  discoverDirectoryImportSources,
  loadPreparedImportRecord,
  type DirectoryImportSourceDescriptor
} from '../ipc/importSourcePipeline.js';

import { logReadwiseScanFailed, logReadwiseScanStarted } from './importRunLogger.js';
import { logReadwiseRunCompleted, shouldLogReadwiseScan, type KeepImportRunEntry } from './keepImportReadwiseLogging.js';

type KeepImportPreviewStatus = NativeKeepImportPreviewResult['entries'][number]['status'];

interface KeepImportPreviewEntry {
  detail: string | null;
  sourcePath: string;
  status: KeepImportPreviewStatus;
}

export interface KeepImportRuleConfig {
  directoryPath: string;
  highlightPolicy: ImportHighlightPolicy;
  ruleId: string;
  sourceType?: 'generic' | 'readwise';
}

function isBlockedByDeletedNode(ruleId: string, sourcePath: string) {
  const existingItem = readKeepImportItem(ruleId, sourcePath);
  if (!existingItem?.last_node_id) {
    return { blocked: false, existingItem };
  }
  const nodeState = readKeepImportNodeState(existingItem.last_node_id);
  return {
    blocked: !nodeState || nodeState.deleted_at !== null,
    existingItem
  };
}

async function classifySource(
  config: KeepImportRuleConfig,
  source: DirectoryImportSourceDescriptor
): Promise<KeepImportPreviewEntry> {
  const sourcePath = source.sourceName;
  const { blocked, existingItem } = isBlockedByDeletedNode(config.ruleId, sourcePath);
  if (blocked) {
    return {
      detail: 'This source was deleted in Foliole and will stay blocked until you import it again manually.',
      sourcePath,
      status: 'blocked_deleted'
    };
  }
  if (
    existingItem &&
    existingItem.source_mtime_ms === source.mtimeMs &&
    existingItem.source_size_bytes === source.sizeBytes
  ) {
    return { detail: 'No file changes detected since the last keep scan.', sourcePath, status: 'unchanged' };
  }
  try {
    await loadPreparedImportRecord(source, {
      highlightPolicy: config.highlightPolicy,
      importedAt: new Date().toISOString()
    });
    return {
      detail: existingItem ? 'File changed and will be refreshed when enabled.' : 'New file will be imported when enabled.',
      sourcePath,
      status: existingItem ? 'updated' : 'new'
    };
  } catch (error) {
    return {
      detail: error instanceof Error ? error.message : 'Unable to read this file during preview.',
      sourcePath,
      status: 'failed'
    };
  }
}

function buildPreviewResult(rootPath: string, previewedAt: string, entries: KeepImportPreviewEntry[]): NativeKeepImportPreviewResult {
  return {
    blocked_count: entries.filter((entry) => entry.status === 'blocked_deleted').length,
    discovered_count: entries.length,
    entries: entries.map((entry) => ({
      detail: entry.detail,
      source_path: entry.sourcePath,
      status: entry.status
    })),
    failed_count: entries.filter((entry) => entry.status === 'failed').length,
    new_count: entries.filter((entry) => entry.status === 'new').length,
    previewed_at: previewedAt,
    root_path: rootPath,
    unchanged_count: entries.filter((entry) => entry.status === 'unchanged').length,
    updated_count: entries.filter((entry) => entry.status === 'updated').length
  };
}

export async function previewKeepImportRule(config: KeepImportRuleConfig): Promise<NativeKeepImportPreviewResult> {
  const previewedAt = new Date().toISOString();
  const discoveredSources = await discoverDirectoryImportSources(config.directoryPath);
  const entries = await Promise.all(discoveredSources.map((source) => classifySource(config, source)));
  return buildPreviewResult(config.directoryPath, previewedAt, entries);
}

function persistKeepImportState(
  config: KeepImportRuleConfig,
  source: DirectoryImportSourceDescriptor,
  record: PersistedImportRecord,
  status: 'blocked_deleted' | 'degraded' | 'duplicate' | 'failed' | 'imported'
) {
  upsertKeepImportItem({
    lastImportedAt: status === 'blocked_deleted' ? null : record.importedAt,
    lastNodeId: record.nodeId,
    lastSeenAt: record.importedAt,
    lastStatus: status,
    ruleId: config.ruleId,
    sourceMtimeMs: source.mtimeMs,
    sourcePath: source.sourceName,
    sourceSizeBytes: source.sizeBytes
  });
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

async function runKeepImportSource(config: KeepImportRuleConfig, source: DirectoryImportSourceDescriptor) {
  const importedAt = new Date().toISOString();
  const blockedState = isBlockedByDeletedNode(config.ruleId, source.sourceName);
  if (blockedState.blocked) {
    const blockedRecord = createBlockedRecord(source, importedAt, blockedState.existingItem?.last_node_id ?? null);
    persistKeepImportState(config, source, blockedRecord, 'blocked_deleted');
    return {
      detail: 'This source was deleted in Foliole and will stay blocked until you import it again manually.',
      failureReason: blockedRecord.failureReason,
      importStatus: 'blocked_deleted' as const
    };
  }
  try {
    const record = runPreparedImport(
      await loadPreparedImportRecord(source, {
        highlightPolicy: config.highlightPolicy,
        importedAt
      })
    );
    persistKeepImportState(
      config,
      source,
      record,
      record.resultStatus === 'degraded' ? 'degraded' : record.duplicateSemantic === 'duplicate' ? 'duplicate' : 'imported'
    );
    const importStatus: 'degraded' | 'duplicate' | 'imported' =
      record.resultStatus === 'degraded' ? 'degraded' : record.duplicateSemantic === 'duplicate' ? 'duplicate' : 'imported';
    return {
      detail:
        importStatus === 'duplicate'
          ? 'File content was already imported and no new node was created.'
          : importStatus === 'degraded'
            ? record.degradedReason ?? 'Imported with degraded content.'
            : 'Imported successfully.',
      failureReason: record.failureReason,
      importStatus
    };
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : 'Unknown keep import failure';
    const record = recordPreparedImportFailure(
      buildPreparedImportRecord(source, { content: '', highlightPolicy: config.highlightPolicy, importedAt }),
      failureReason
    );
    persistKeepImportState(config, source, record, 'failed');
    return {
      detail: failureReason,
      failureReason,
      importStatus: 'failed' as const
    };
  }
}

export async function runKeepImportRule(config: KeepImportRuleConfig) {
  if (shouldLogReadwiseScan(config.sourceType)) {
    await logReadwiseScanStarted({ directoryPath: config.directoryPath, ruleId: config.ruleId });
  }
  try {
    const discoveredSources = await discoverDirectoryImportSources(config.directoryPath);
    const runEntries: KeepImportRunEntry[] = [];
    for (const source of discoveredSources) {
      const preview = await classifySource(config, source);
      if (preview.status === 'unchanged' || preview.status === 'failed' || preview.status === 'blocked_deleted') {
        if (preview.status === 'blocked_deleted') {
          const importedAt = new Date().toISOString();
          const blockedState = isBlockedByDeletedNode(config.ruleId, source.sourceName);
          const blockedRecord = createBlockedRecord(source, importedAt, blockedState.existingItem?.last_node_id ?? null);
          persistKeepImportState(config, source, blockedRecord, 'blocked_deleted');
        }
        runEntries.push({
          action: 'skipped',
          detail: preview.detail,
          failureReason: preview.status === 'failed' ? preview.detail : preview.status === 'blocked_deleted' ? 'blocked_deleted' : null,
          importStatus: preview.status === 'blocked_deleted' ? 'blocked_deleted' : null,
          previewStatus: preview.status,
          sourcePath: source.sourceName
        });
        continue;
      }
      const result = await runKeepImportSource(config, source);
      runEntries.push({
        action: 'import_attempted',
        detail: result.detail,
        failureReason: result.failureReason,
        importStatus: result.importStatus,
        previewStatus: preview.status,
        sourcePath: source.sourceName
      });
    }
    if (shouldLogReadwiseScan(config.sourceType)) {
      await logReadwiseRunCompleted({
        directoryPath: config.directoryPath,
        entries: runEntries,
        ruleId: config.ruleId
      });
    }
  } catch (error) {
    if (shouldLogReadwiseScan(config.sourceType)) {
      await logReadwiseScanFailed({
        directoryPath: config.directoryPath,
        error,
        ruleId: config.ruleId
      });
    }
    throw error;
  }
}
