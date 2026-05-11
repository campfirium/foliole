import { recordPreparedImportFailure, runPreparedImport } from '../database/importPipeline.js';
import type { DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';
import { buildPreparedImportRecord } from '../ipc/importSourcePipeline.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { persistDetectedSourceUpdate } from './keepImportDetectedSourceUpdate.js';
import {
  loadPreparedKeepImportRecord,
  resolveKeepImportSourceSignature
} from './keepImportPreparedRecord.js';
import {
  resolveReadwiseKeepImportDestination,
  runReadwiseExternalDocumentImport,
  shouldRunUnchangedReadwiseDestination
} from './keepImportReadwiseDestination.js';
import type { KeepImportRunEntry } from './keepImportReadwiseLogging.js';
import type { KeepImportRuleConfig } from './keepImportService.js';
import { persistKeepImportState } from './keepImportServiceState.js';
import { classifySource, isBlockedByDeletedNode } from './keepImportSourceClassifier.js';
import { hasPrimarySourceChanged } from './keepImportSourceSignature.js';
import { resolveKeepImportResultDetail, resolveKeepImportResultStatus, resolvePersistedSourceUpdateFlag } from './keepImportSourceUpdateState.js';
import { notifyManagedInboxUpdated } from './managedInboxEvents.js';

async function runKeepImportSource(config: KeepImportRuleConfig, source: DirectoryImportSourceDescriptor) {
  const importedAt = new Date().toISOString();
  const sourceSignature = await resolveKeepImportSourceSignature(config, source);
  const blockedState = isBlockedByDeletedNode(config.ruleId, source.sourceName);
  const hasSourceUpdate = resolvePersistedSourceUpdateFlag(
    blockedState.existingItem,
    hasPrimarySourceChanged(blockedState.existingItem, sourceSignature)
  );
  try {
    const record = runPreparedImport(await loadPreparedKeepImportRecord(config, source, importedAt));
    const importStatus = resolveKeepImportResultStatus(record);
    persistKeepImportState(config, source, sourceSignature, record, importStatus, hasSourceUpdate);
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

export async function runSingleKeepImportSource(
  config: KeepImportRuleConfig,
  source: DirectoryImportSourceDescriptor
): Promise<KeepImportRunEntry> {
  const preview = await classifySource(config, source);
  if (
    preview.status === 'unchanged' &&
    !(await shouldRunUnchangedReadwiseDestination(config, source))
  ) {
    return {
      action: 'skipped',
      detail: preview.detail,
      failureReason: null,
      importStatus: null,
      previewStatus: preview.status,
      sourcePath: source.sourceName
    };
  }
  if (preview.status === 'failed') {
    return {
      action: 'skipped',
      detail: preview.detail,
      failureReason: preview.detail,
      importStatus: null,
      previewStatus: preview.status,
      sourcePath: source.sourceName
    };
  }
  if (config.sourceType === 'readwise') {
    const readwiseResult = await runReadwiseDestination(config, source, preview.status);
    if (readwiseResult) {
      return readwiseResult;
    }
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
