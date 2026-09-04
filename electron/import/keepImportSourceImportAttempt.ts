import { NodeBodyUnavailableError } from '../../lib/core/database/nodeBodyResolution.js';
import { recordPreparedImportFailure } from '../database/importPipeline.js';
import type { DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';
import { buildPreparedImportRecord } from '../ipc/importSourcePipeline.js';

import { loadImportManagerSettings } from './importManagerSettings.js';
import { runLoadedPreparedImportAttempt } from './keepImportLoadedPreparedImportAttempt.js';
import {
  loadPreparedKeepImportRecord,
  resolveKeepImportSourceSignature
} from './keepImportPreparedRecord.js';
import type { KeepImportProgressSink } from './keepImportProgress.js';
import { isKeepImportAbortError, throwIfKeepImportAborted } from './keepImportProgress.js';
import type { KeepImportRuleConfig } from './keepImportService.js';
import { persistKeepImportState } from './keepImportServiceState.js';
import { isBlockedByDeletedNode } from './keepImportSourceClassifier.js';
import { hasPrimarySourceChanged } from './keepImportSourceSignature.js';
import { resolvePersistedSourceUpdateFlag } from './keepImportSourceUpdateState.js';
import { applyWatchedPreparedImportIdentity } from './watchedPreparedImportIdentity.js';

function recordFailedKeepImportAttempt(input: {
  config: KeepImportRuleConfig;
  failureReason: string;
  hasSourceUpdate: boolean;
  importedAt: string;
  source: DirectoryImportSourceDescriptor;
  sourceSignature: {
    highlight: { mtimeMs: number; sizeBytes: number } | null;
    primary: { mtimeMs: number; sizeBytes: number };
  };
}) {
  const prepared = applyWatchedPreparedImportIdentity(input.config, input.source,
    buildPreparedImportRecord(input.source, {
      content: '',
      highlightPolicy: input.config.highlightPolicy,
      importedAt: input.importedAt,
      titleStrategy: loadImportManagerSettings().titleStrategy
    }));
  const record = recordPreparedImportFailure(prepared, input.failureReason);
  persistKeepImportState(input.config, input.source, input.sourceSignature, record, 'failed', input.hasSourceUpdate);
  return {
    detail: input.failureReason,
    failureReason: input.failureReason,
    importId: record.importId,
    importStatus: 'failed' as const
  };
}

export async function runKeepImportSourceImportAttempt(
  config: KeepImportRuleConfig,
  source: DirectoryImportSourceDescriptor,
  options: {
    automaticDuplicateNoop: boolean;
    clearSourceUpdateOnSuccess?: boolean;
    onProgress?: KeepImportProgressSink | undefined;
  }
) {
  const importedAt = new Date().toISOString();
  throwIfKeepImportAborted(config.signal);
  const sourceSignature = await resolveKeepImportSourceSignature(config, source);
  throwIfKeepImportAborted(config.signal);
  const blockedState = isBlockedByDeletedNode(config.ruleId, source.sourceName);
  const hasSourceUpdate = resolvePersistedSourceUpdateFlag(
    blockedState.existingItem,
    hasPrimarySourceChanged(blockedState.existingItem, sourceSignature)
  );
  try {
    const loaded = await loadPreparedKeepImportRecord(config, source, importedAt);
    const prepared = applyWatchedPreparedImportIdentity(config, source, loaded);
    throwIfKeepImportAborted(config.signal);
    return await runLoadedPreparedImportAttempt({
      automaticDuplicateNoop: options.automaticDuplicateNoop,
      config,
      hasSourceUpdate: options.clearSourceUpdateOnSuccess ? false : hasSourceUpdate,
      onProgress: options.onProgress,
      prepared,
      ...(config.signal ? { signal: config.signal } : {}),
      source,
      sourceSignature
    });
  } catch (error) {
    if (isKeepImportAbortError(error)) {
      throw error;
    }
    if (error instanceof NodeBodyUnavailableError) {
      return {
        detail: error.message,
        failureReason: error.message,
        importId: `keep-body-unavailable-${source.sourceName}`,
        importStatus: null,
        noOp: true
      };
    }
    const failureReason = error instanceof Error ? error.message : 'Unknown keep import failure';
    return recordFailedKeepImportAttempt({
      config,
      failureReason,
      hasSourceUpdate,
      importedAt,
      source,
      sourceSignature
    });
  }
}
