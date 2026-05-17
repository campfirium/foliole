import type { PreparedImportRecord } from '../../lib/core/import/contract.js';
import { runPreparedImport } from '../database/importPipeline.js';
import type { DirectoryImportSourceDescriptor } from '../ipc/importSourcePipeline.js';

import { persistAutomaticDuplicateNoop } from './keepImportDuplicateNoop.js';
import { processSearchIndexForKeepImportSource } from './keepImportIndexingProgress.js';
import { runPreparedImportInWorkerWithSignal } from './keepImportPreparedImportWorkerClient.js';
import type { KeepImportProgressSink } from './keepImportProgress.js';
import {
  countPreparedImportHighlights,
  throwIfKeepImportAborted
} from './keepImportProgress.js';
import type { KeepImportRuleConfig } from './keepImportService.js';
import { persistKeepImportState } from './keepImportServiceState.js';
import {
  resolveKeepImportResultDetail,
  resolveKeepImportResultStatus
} from './keepImportSourceUpdateState.js';

function publishHighlightWriteProgress(input: {
  highlightProcessedCount: number;
  highlightTotalCount: number;
  importWriteElapsedMs?: number;
  onProgress: KeepImportProgressSink | undefined;
  sourceName: string;
}) {
  input.onProgress?.({
    currentSourcePath: input.sourceName,
    highlightProcessedCount: input.highlightProcessedCount,
    highlightTotalCount: input.highlightTotalCount,
    ...(typeof input.importWriteElapsedMs === 'number' ? { importWriteElapsedMs: input.importWriteElapsedMs } : {}),
    phase: 'writing',
    sourceProcessedCount: 0,
    sourceTotalCount: 0
  });
}

function publishNoopHighlightProgress(input: {
  highlightTotalCount: number;
  onProgress: KeepImportProgressSink | undefined;
  sourceName: string;
}) {
  input.onProgress?.({
    currentSourcePath: input.sourceName,
    highlightProcessedCount: input.highlightTotalCount,
    highlightTotalCount: input.highlightTotalCount,
    phase: 'source_completed',
    sourceProcessedCount: 0,
    sourceTotalCount: 0
  });
}

async function runPreparedImportWithResponsiveBoundary(prepared: PreparedImportRecord, signal?: AbortSignal) {
  throwIfKeepImportAborted(signal);
  if (
    prepared.sourceProfile === 'body_with_highlight_sidecar' &&
    countPreparedImportHighlights(prepared) >= 300
  ) {
    return runPreparedImportInWorkerWithSignal({ prepared, ...(signal ? { signal } : {}) });
  }
  const record = runPreparedImport(prepared);
  throwIfKeepImportAborted(signal);
  return record;
}

async function runPreparedImportWithIndexProgress(input: {
  highlightTotalCount: number;
  onProgress: KeepImportProgressSink | undefined;
  prepared: PreparedImportRecord;
  signal?: AbortSignal;
  sourceName: string;
}) {
  throwIfKeepImportAborted(input.signal);
  publishHighlightWriteProgress({
    highlightTotalCount: input.highlightTotalCount,
    highlightProcessedCount: 0,
    onProgress: input.onProgress,
    sourceName: input.sourceName
  });
  const writeStartedAt = Date.now();
  const record = await runPreparedImportWithResponsiveBoundary(input.prepared, input.signal);
  publishHighlightWriteProgress({
    highlightTotalCount: input.highlightTotalCount,
    highlightProcessedCount: input.highlightTotalCount,
    importWriteElapsedMs: Date.now() - writeStartedAt,
    onProgress: input.onProgress,
    sourceName: input.sourceName
  });
  return processSearchIndexForKeepImportSource({
    onProgress: input.onProgress,
    record,
    sourceName: input.sourceName
  });
}

export async function runLoadedPreparedImportAttempt(input: {
  automaticDuplicateNoop: boolean;
  config: KeepImportRuleConfig;
  hasSourceUpdate: boolean;
  onProgress: KeepImportProgressSink | undefined;
  prepared: PreparedImportRecord;
  signal?: AbortSignal;
  source: DirectoryImportSourceDescriptor;
  sourceSignature: {
    highlight: { mtimeMs: number; sizeBytes: number } | null;
    primary: { mtimeMs: number; sizeBytes: number };
  };
}) {
  throwIfKeepImportAborted(input.signal);
  const highlightTotalCount = countPreparedImportHighlights(input.prepared);
  const duplicateNoop = input.automaticDuplicateNoop
    ? persistAutomaticDuplicateNoop({
      config: input.config,
      hasSourceUpdate: input.hasSourceUpdate,
      prepared: input.prepared,
      source: input.source,
      sourceSignature: input.sourceSignature
    })
    : null;
  if (duplicateNoop) {
    publishNoopHighlightProgress({
      highlightTotalCount,
      onProgress: input.onProgress,
      sourceName: input.source.sourceName
    });
    return {
      detail: 'No content changes detected since the last import.',
      failureReason: null,
      importId: duplicateNoop.importId,
      importStatus: 'duplicate' as const,
      noOp: true
    };
  }
  const indexedRecord = await runPreparedImportWithIndexProgress({
    highlightTotalCount,
    onProgress: input.onProgress,
    prepared: input.prepared,
    ...(input.signal ? { signal: input.signal } : {}),
    sourceName: input.source.sourceName
  });
  const importStatus = resolveKeepImportResultStatus(indexedRecord);
  persistKeepImportState(input.config, input.source, input.sourceSignature, indexedRecord, importStatus, input.hasSourceUpdate);
  return {
    detail: resolveKeepImportResultDetail(indexedRecord, importStatus),
    failureReason: indexedRecord.failureReason,
    importId: indexedRecord.importId,
    importStatus
  };
}
