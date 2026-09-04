import { readKeepImportItem } from '../database/keepImportItems.js';
import type { DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { persistDetectedSourceUpdate } from './keepImportDetectedSourceUpdate.js';
import { resolveKeepImportSourceSignature } from './keepImportPreparedRecord.js';
import type { KeepImportProgressSink } from './keepImportProgress.js';
import {
  resolveReadwiseKeepImportDestination,
  runReadwiseExternalDocumentImport,
  shouldRunUnchangedReadwiseDestination
} from './keepImportReadwiseDestination.js';
import type { KeepImportRunEntry } from './keepImportReadwiseLogging.js';
import { shouldDeferReadwiseToSourceUpdate } from './keepImportReadwiseSourceUpdate.js';
import type { KeepImportRuleConfig } from './keepImportService.js';
import { persistBlockedKeepImportState } from './keepImportServiceState.js';
import { guardKeepImportSourceBody } from './keepImportSourceBodyGuard.js';
import { classifySource, isBlockedByDeletedNode } from './keepImportSourceClassifier.js';
import { applySuccessfulSourceHandling } from './keepImportSourceHandling.js';
import { runKeepImportSourceImportAttempt } from './keepImportSourceImportAttempt.js';
import { hasPrimarySourceChanged } from './keepImportSourceSignature.js';
import { resolvePersistedSourceUpdateFlag } from './keepImportSourceUpdateState.js';
import { notifyManagedInboxUpdated } from './managedInboxEvents.js';

function createSkippedKeepImportEntry(input: {
  detail: string | null;
  failureReason: string | null;
  previewStatus: KeepImportRunEntry['previewStatus'];
  sourcePath: string;
}): KeepImportRunEntry {
  return {
    action: 'skipped',
    detail: input.detail,
    failureReason: input.failureReason,
    importStatus: null,
    previewStatus: input.previewStatus,
    sourcePath: input.sourcePath
  };
}

function notifyKeepImportUpdated(importId: string, enabled: boolean) {
  if (enabled) {
    notifyManagedInboxUpdated(importId);
  }
}

function notifyPendingSourceUpdate(config: KeepImportRuleConfig, sourcePath: string) {
  const existingItem = readKeepImportItem(config.ruleId, sourcePath);
  if (existingItem?.has_source_update) {
    notifyManagedInboxUpdated(`keep-update-${config.ruleId}-${sourcePath}`);
  }
}

async function persistBlockedDeletedKeepImport(
  config: KeepImportRuleConfig,
  source: DirectoryImportSourceDescriptor,
  detail: string | null,
  previewStatus: KeepImportRunEntry['previewStatus'],
  notifyUpdate: boolean
): Promise<KeepImportRunEntry> {
  const importedAt = new Date().toISOString();
  const sourceSignature = await resolveKeepImportSourceSignature(config, source);
  const blockedState = isBlockedByDeletedNode(config.ruleId, source.sourceName);
  const hasSourceUpdate = resolvePersistedSourceUpdateFlag(
    blockedState.existingItem,
    hasPrimarySourceChanged(blockedState.existingItem, sourceSignature)
  );
  const record = persistBlockedKeepImportState(
    config,
    source,
    sourceSignature,
    importedAt,
    blockedState.existingItem?.last_node_id ?? null,
    hasSourceUpdate
  );
  notifyKeepImportUpdated(record.importId, notifyUpdate);
  return {
    action: 'skipped',
    detail,
    failureReason: record.failureReason,
    importStatus: 'blocked_deleted',
    previewStatus,
    sourcePath: source.sourceName
  };
}

async function skipDetectedSourceUpdate(
  config: KeepImportRuleConfig,
  source: DirectoryImportSourceDescriptor,
  previewStatus: KeepImportRunEntry['previewStatus']
): Promise<KeepImportRunEntry> {
  const result = await persistDetectedSourceUpdate(config, source);
  notifyManagedInboxUpdated(result.importId);
  return {
    action: 'skipped',
    detail: result.detail,
    failureReason: result.failureReason,
    importStatus: result.importStatus,
    previewStatus,
    sourcePath: source.sourceName
  };
}

async function runImportAttempt(
  config: KeepImportRuleConfig,
  source: DirectoryImportSourceDescriptor,
  options: { forceTopicImport?: boolean; notifyUpdate: boolean; onProgress?: KeepImportProgressSink | undefined },
  previewStatus: KeepImportRunEntry['previewStatus']
): Promise<KeepImportRunEntry> {
  const result = await runKeepImportSourceImportAttempt(config, source, {
    automaticDuplicateNoop: !options.forceTopicImport && !(config.sourceType === 'readwise' && previewStatus === 'updated'),
    clearSourceUpdateOnSuccess: Boolean(options.forceTopicImport),
    onProgress: options.onProgress
  });
  if ('noOp' in result && result.noOp) {
    return createSkippedKeepImportEntry({
      detail: result.detail,
      failureReason: result.failureReason,
      previewStatus,
      sourcePath: source.sourceName
    });
  }
  notifyKeepImportUpdated(result.importId, options.notifyUpdate);
  return {
    action: 'import_attempted',
    detail: result.detail,
    failureReason: result.failureReason,
    importStatus: result.importStatus,
    previewStatus,
    sourcePath: source.sourceName
  };
}

async function runSingleKeepImportSourceResolved(
  config: KeepImportRuleConfig,
  source: DirectoryImportSourceDescriptor,
  options: { forceTopicImport?: boolean; notifyUpdate?: boolean; onProgress?: KeepImportProgressSink | undefined } = {}
): Promise<KeepImportRunEntry> {
  const notifyUpdate = options.notifyUpdate ?? true;
  const preview = await classifySource(config, source);
  if (
    preview.status === 'unchanged' &&
    !(await shouldRunUnchangedReadwiseDestination(config, source))
  ) {
    const cleanupDetail = await applySuccessfulSourceHandling(config, source);
    notifyPendingSourceUpdate(config, source.sourceName);
    return createSkippedKeepImportEntry({
      detail: cleanupDetail ?? preview.detail,
      failureReason: null,
      previewStatus: preview.status,
      sourcePath: source.sourceName
    });
  }
  if (preview.status === 'failed') {
    return createSkippedKeepImportEntry({
      detail: preview.detail,
      failureReason: preview.detail,
      previewStatus: preview.status,
      sourcePath: source.sourceName
    });
  }
  if (preview.status === 'blocked_deleted') {
    return persistBlockedDeletedKeepImport(config, source, preview.detail, preview.status, notifyUpdate);
  }
  if (config.sourceType === 'readwise' && !options.forceTopicImport) {
    const readwiseResult = await runReadwiseDestination(config, source, preview.status);
    if (readwiseResult) {
      return readwiseResult;
    }
  }
  const readwiseHighlightUpdate = config.sourceType === 'readwise' && preview.status === 'updated';
  if (preview.status === 'updated' && !options.forceTopicImport && await shouldDeferReadwiseToSourceUpdate(config, source)) {
    return skipDetectedSourceUpdate(config, source, preview.status);
  }
  return runImportAttempt(
    config,
    source,
    { ...options, forceTopicImport: options.forceTopicImport || readwiseHighlightUpdate, notifyUpdate },
    preview.status
  );
}

export async function runSingleKeepImportSource(
  config: KeepImportRuleConfig,
  source: DirectoryImportSourceDescriptor,
  options: { forceTopicImport?: boolean; notifyUpdate?: boolean; onProgress?: KeepImportProgressSink | undefined } = {}
): Promise<KeepImportRunEntry> {
  return guardKeepImportSourceBody(source, () => runSingleKeepImportSourceResolved(config, source, options));
}

async function runReadwiseDestination(
  config: KeepImportRuleConfig,
  source: DirectoryImportSourceDescriptor,
  previewStatus: KeepImportRunEntry['previewStatus']
): Promise<KeepImportRunEntry | null> {
  const destination = await resolveReadwiseKeepImportDestination(config, source);
  if (destination === 'off') {
    return {
      action: 'skipped',
      detail: 'Skipped by current Readwise import behavior.',
      failureReason: null,
      importStatus: null,
      previewStatus,
      sourcePath: source.sourceName
    };
  }
  if (destination !== 'external') {
    return null;
  }
  const result = await runReadwiseExternalDocumentImport(config, source);
  return {
    action: 'import_attempted',
    detail: result.detail,
    failureReason: result.failureReason,
    importStatus: result.importStatus,
    previewStatus,
    sourcePath: source.sourceName
  };
}
