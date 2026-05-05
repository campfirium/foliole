import type { ImportHighlightPolicy } from '../../lib/core/import/contract.js';
import { buildImportedHighlightPreview } from '../../lib/core/import/importedHighlightPreview.js';
import type { NativeKeepImportPreviewResult } from '../../lib/platform/nativeImportContract.js';
import { recordPreparedImportFailure, runPreparedImport } from '../database/importPipeline.js';
import { readKeepImportItem, readKeepImportNodeState } from '../database/keepImportItems.js';
import { buildPreparedImportRecord, discoverDirectoryImportSources, type DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { logReadwiseScanFailed, logReadwiseScanStarted } from './importRunLogger.js';
import { persistDetectedSourceUpdate } from './keepImportDetectedSourceUpdate.js';
import {
  loadPreparedKeepImportRecord,
  resolveKeepImportSourceSignature,
  shouldKeepImportReadwiseSource
} from './keepImportPreparedRecord.js';
import { buildKeepImportPreviewResult } from './keepImportPreviewResult.js';
import { logReadwiseRunCompleted, shouldLogReadwiseScan, type KeepImportRunEntry } from './keepImportReadwiseLogging.js';
import { createBlockedRecord, persistKeepImportState } from './keepImportServiceState.js';
import { hasHighlightSourceChanged, hasPrimarySourceChanged } from './keepImportSourceSignature.js';
import { resolveKeepImportResultDetail, resolveKeepImportResultStatus, resolvePersistedSourceUpdateFlag } from './keepImportSourceUpdateState.js';
import { notifyManagedInboxUpdated } from './managedInboxEvents.js';

type KeepImportPreviewStatus = NativeKeepImportPreviewResult['entries'][number]['status'];

interface KeepImportPreviewEntry {
  detectedHighlightCount: number;
  detail: string | null;
  highlightSamples: NativeKeepImportPreviewResult['entries'][number]['highlight_samples'];
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
  const sourceSignature = await resolveKeepImportSourceSignature(config, source);
  const { blocked, existingItem } = isBlockedByDeletedNode(config.ruleId, sourcePath);
  if (blocked) {
    return {
      detectedHighlightCount: 0,
      detail: 'This source was deleted in Foliole and will stay blocked until you import it again manually.',
      highlightSamples: [],
      sourcePath,
      status: 'blocked_deleted'
    };
  }
  const primaryChanged = hasPrimarySourceChanged(existingItem, sourceSignature);
  const highlightChanged = config.sourceType === 'readwise' ? hasHighlightSourceChanged(existingItem, sourceSignature) : false;
  if (existingItem && !primaryChanged && !highlightChanged) {
    return { detail: 'No file changes detected since the last keep scan.', detectedHighlightCount: 0, highlightSamples: [], sourcePath, status: 'unchanged' };
  }
  try {
    const prepared = await loadPreparedKeepImportRecord(config, source, new Date().toISOString());
    const highlightPreview = buildImportedHighlightPreview({
      content: prepared.content,
      sourceName: sourcePath
    });
    return {
      detectedHighlightCount: highlightPreview.detectedHighlightCount,
      detail:
        !existingItem
          ? 'New file will be imported when enabled.'
          : highlightChanged && !primaryChanged
            ? 'Highlight file changed and will refresh highlight updates.'
            : 'Content file changed and will be refreshed when enabled.',
      highlightSamples: highlightPreview.samples,
      sourcePath,
      status: existingItem ? 'updated' : 'new'
    };
  } catch (error) {
    return {
      detectedHighlightCount: 0,
      detail: error instanceof Error ? error.message : 'Unable to read this file during preview.',
      highlightSamples: [],
      sourcePath,
      status: 'failed'
    };
  }
}

export async function previewKeepImportRule(config: KeepImportRuleConfig): Promise<NativeKeepImportPreviewResult> {
  const previewedAt = new Date().toISOString();
  const discoveredSources = await discoverDirectoryImportSources(config.directoryPath);
  const importableSources = (
    await Promise.all(
      discoveredSources.map(async (source) => ((await shouldKeepImportReadwiseSource(config, source)) ? source : null))
    )
  ).filter((source): source is DirectoryImportSourceDescriptor => source !== null);
  const entries = await Promise.all(importableSources.map((source) => classifySource(config, source)));
  return buildKeepImportPreviewResult(config.directoryPath, previewedAt, entries);
}

async function runKeepImportSource(config: KeepImportRuleConfig, source: DirectoryImportSourceDescriptor) {
  const importedAt = new Date().toISOString();
  const sourceSignature = await resolveKeepImportSourceSignature(config, source);
  const blockedState = isBlockedByDeletedNode(config.ruleId, source.sourceName);
  const hasSourceUpdate = resolvePersistedSourceUpdateFlag(
    blockedState.existingItem,
    hasPrimarySourceChanged(blockedState.existingItem, sourceSignature)
  );
  if (blockedState.blocked) {
    const blockedRecord = createBlockedRecord(source, importedAt, blockedState.existingItem?.last_node_id ?? null);
    persistKeepImportState(config, source, sourceSignature, blockedRecord, 'blocked_deleted', hasSourceUpdate);
    return {
      detail: 'This source was deleted in Foliole and will stay blocked until you import it again manually.',
      failureReason: blockedRecord.failureReason,
      importId: blockedRecord.importId,
      importStatus: 'blocked_deleted' as const
    };
  }
  try {
    const record = runPreparedImport(await loadPreparedKeepImportRecord(config, source, importedAt));
    const importStatus = resolveKeepImportResultStatus(record);
    persistKeepImportState(
      config,
      source,
      sourceSignature,
      record,
      importStatus,
      hasSourceUpdate
    );
    return {
      detail: resolveKeepImportResultDetail(record, importStatus),
      failureReason: record.failureReason,
      importId: record.importId,
      importStatus
    };
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : 'Unknown keep import failure';
    const record = recordPreparedImportFailure(
      buildPreparedImportRecord(source, {
        content: '',
        highlightPolicy: config.highlightPolicy,
        importedAt,
        titleStrategy: loadImportManagerSettings().titleStrategy
      }),
      failureReason
    );
    persistKeepImportState(config, source, sourceSignature, record, 'failed', hasSourceUpdate);
    return {
      detail: failureReason,
      failureReason,
      importId: record.importId,
      importStatus: 'failed' as const
    };
  }
}

async function runSingleKeepImportSource(config: KeepImportRuleConfig, source: DirectoryImportSourceDescriptor): Promise<KeepImportRunEntry> {
  const preview = await classifySource(config, source);
  if (preview.status === 'unchanged' || preview.status === 'failed' || preview.status === 'blocked_deleted') {
    await persistBlockedKeepImportState(config, preview.status, source);
    return {
      action: 'skipped',
      detail: preview.detail,
      failureReason: preview.status === 'failed' ? preview.detail : preview.status === 'blocked_deleted' ? 'blocked_deleted' : null,
      importStatus: preview.status === 'blocked_deleted' ? 'blocked_deleted' : null,
      previewStatus: preview.status,
      sourcePath: source.sourceName
    };
  }
  if (preview.status === 'updated') {
    const result = await persistDetectedSourceUpdate(config, source);
    notifyManagedInboxUpdated(result.importId);
    return {
      action: 'skipped',
      detail: result.detail,
      failureReason: result.failureReason,
      importStatus: result.importStatus,
      previewStatus: preview.status,
      sourcePath: source.sourceName
    };
  }
  const result = await runKeepImportSource(config, source);
  notifyManagedInboxUpdated(result.importId);
  return {
    action: 'import_attempted',
    detail: result.detail,
    failureReason: result.failureReason,
    importStatus: result.importStatus,
    previewStatus: preview.status,
    sourcePath: source.sourceName
  };
}

export async function runKeepImportRule(config: KeepImportRuleConfig) {
  if (shouldLogReadwiseScan(config.sourceType)) {
    await logReadwiseScanStarted({ directoryPath: config.directoryPath, ruleId: config.ruleId });
  }
  try {
    const discoveredSources = await discoverDirectoryImportSources(config.directoryPath);
    const importableSources = (
      await Promise.all(
        discoveredSources.map(async (source) => ((await shouldKeepImportReadwiseSource(config, source)) ? source : null))
      )
    ).filter((source): source is DirectoryImportSourceDescriptor => source !== null);
    const runEntries: KeepImportRunEntry[] = [];
    for (const source of importableSources) {
      runEntries.push(await runSingleKeepImportSource(config, source));
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

async function persistBlockedKeepImportState(
  config: KeepImportRuleConfig,
  previewStatus: KeepImportPreviewStatus,
  source: DirectoryImportSourceDescriptor
) {
  if (previewStatus !== 'blocked_deleted') {
    return;
  }
  const importedAt = new Date().toISOString();
  const blockedState = isBlockedByDeletedNode(config.ruleId, source.sourceName);
  const sourceSignature = await resolveKeepImportSourceSignature(config, source);
  const blockedRecord = createBlockedRecord(source, importedAt, blockedState.existingItem?.last_node_id ?? null);
  persistKeepImportState(
    config,
    source,
    sourceSignature,
    blockedRecord,
    'blocked_deleted',
    Boolean(blockedState.existingItem?.has_source_update)
  );
}
