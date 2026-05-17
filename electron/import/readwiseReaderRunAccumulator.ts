import type { ReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import type {
  NativeReadwiseImportRunFailedSource,
  NativeReadwiseImportRunProgressEvent,
  NativeReadwiseImportRunResult
} from '../../lib/platform/nativeImportContract.js';
import { IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL } from '../ipc/contracts.js';

export type ReadwiseImportProgressWindow = {
  isDestroyed: () => boolean;
  webContents: {
    send: (channel: string, payload: NativeReadwiseImportRunProgressEvent) => void;
  };
};

export interface ReadwiseRunAccumulator {
  entryCount: number;
  failedCount: number;
  failedSources: NativeReadwiseImportRunFailedSource[];
  importedCount: number;
  processedCount: number;
  readwiseConfig: ReadwiseReaderConfig;
  skippedCount: number;
  signal?: AbortSignal;
  totalCount: number;
  window?: ReadwiseImportProgressWindow | null;
}

export function createRunAccumulator(input: {
  readwiseConfig: ReadwiseReaderConfig;
  signal?: AbortSignal;
  sourceCount: number;
  window?: ReadwiseImportProgressWindow | null;
}): ReadwiseRunAccumulator {
  return {
    entryCount: 0,
    failedCount: 0,
    failedSources: [],
    importedCount: 0,
    processedCount: 0,
    readwiseConfig: input.readwiseConfig,
    ...(input.signal ? { signal: input.signal } : {}),
    skippedCount: 0,
    totalCount: input.sourceCount,
    ...(input.window ? { window: input.window } : {})
  };
}

export function publishAccumulatorProgress(
  accumulator: ReadwiseRunAccumulator,
  status: NativeReadwiseImportRunProgressEvent['status'] = 'running',
  details: Partial<NativeReadwiseImportRunProgressEvent> = {}
) {
  if (!accumulator.window || accumulator.window.isDestroyed()) {
    return;
  }
  accumulator.window.webContents.send(IPC_READWISE_READER_IMPORT_PROGRESS_EVENT_CHANNEL, {
    ...details,
    processedCount: accumulator.processedCount,
    status,
    totalCount: accumulator.totalCount
  });
}

export function toReadwiseImportRunResult(
  accumulator: ReadwiseRunAccumulator,
  status: NativeReadwiseImportRunResult['status']
): NativeReadwiseImportRunResult {
  return {
    completed_at: new Date().toISOString(),
    entry_count: accumulator.entryCount,
    failed_count: accumulator.failedCount,
    ...(accumulator.failedSources.length ? { failed_sources: accumulator.failedSources } : {}),
    imported_count: accumulator.importedCount,
    source_count: accumulator.totalCount,
    skipped_count: accumulator.skippedCount,
    status
  };
}
