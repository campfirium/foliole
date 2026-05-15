import { useState } from 'react';

import type { NativeReadwiseImportRunResult } from '../../../lib/platform/nativeImportContract';
import { onReadwiseReaderImportProgress } from '../../shared/platform/runtimeShellEvents';

import type { useReadwiseSetupDraft } from './useReadwiseSetupDraft';
import {
  createReadwiseSetupPayload,
  enableReadwiseImportSource,
  type ReadwiseSetupPayload
} from './useReadwiseSyncPreviewFlow';

type ReadwiseSetupDraft = ReturnType<typeof useReadwiseSetupDraft>;

export interface ReadwiseManualSyncFailedSource {
  reason: string;
  sourceKind: string;
  sourcePath: string;
}

export interface ReadwiseManualSyncStatus {
  failedSources: ReadwiseManualSyncFailedSource[];
  message: string | null;
  tone: 'error' | 'normal';
}

const EMPTY_STATUS: ReadwiseManualSyncStatus = {
  failedSources: [],
  message: null,
  tone: 'normal'
};

function formatSyncProgress(processedCount: number, totalCount: number) {
  return `Syncing ${processedCount}/${totalCount} Readwise source${
    totalCount === 1 ? '' : 's'
  }...`;
}

function countEnabledReadwiseSources(payload: ReadwiseSetupPayload) {
  return payload.readwiseSources.filter(
    (source) =>
      source.keepState === 'enabled' &&
      Boolean(source.kind) &&
      source.primaryPath.trim().length > 0 &&
      source.highlightPath.trim().length > 0
  ).length;
}

function toManualFailedSources(result: NativeReadwiseImportRunResult) {
  return (result.failed_sources ?? []).map((source) => ({
    reason: source.reason,
    sourceKind: source.source_kind,
    sourcePath: source.source_path
  }));
}

function formatSyncResult(result: NativeReadwiseImportRunResult | null): ReadwiseManualSyncStatus {
  if (!result) {
    return {
      failedSources: [],
      message: 'Sync is only available in the desktop app.',
      tone: 'error'
    };
  }
  if (result.failed_count > 0 || result.status === 'failed') {
    return {
      failedSources: toManualFailedSources(result),
      message: `Sync finished with ${result.failed_count} failed source${
        result.failed_count === 1 ? '' : 's'
      }.`,
      tone: 'error'
    };
  }
  if (typeof result.imported_count === 'number' && result.imported_count === 0) {
    return {
      failedSources: [],
      message: 'No new or changed Readwise sources.',
      tone: 'normal'
    };
  }
  if (typeof result.imported_count === 'number') {
    return {
      failedSources: [],
      message: `Synced ${result.imported_count} Readwise source${
        result.imported_count === 1 ? '' : 's'
      }.`,
      tone: 'normal'
    };
  }
  return {
    failedSources: [],
    message: `Synced ${result.source_count} Readwise source${
      result.source_count === 1 ? '' : 's'
    }.`,
    tone: 'normal'
  };
}

function resolveErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Readwise sync failed.';
}

export function useReadwiseManualSync(input: {
  draft: ReadwiseSetupDraft;
  onRunSync?: (input: ReadwiseSetupPayload) => Promise<NativeReadwiseImportRunResult | null>;
}) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [status, setStatus] = useState<ReadwiseManualSyncStatus>(EMPTY_STATUS);

  async function runManualSync() {
    if (!input.onRunSync || isSyncing) {
      return;
    }
    const payload = createReadwiseSetupPayload(
      input.draft,
      { ...input.draft.draftConfig, enabled: true },
      enableReadwiseImportSource(input.draft.draftSources)
    );
    const totalCount = countEnabledReadwiseSources(payload);
    setIsSyncing(true);
    setStatus({
      failedSources: [],
      message: formatSyncProgress(0, totalCount),
      tone: 'normal'
    });
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = await onReadwiseReaderImportProgress((progress) => {
        setStatus({
          failedSources: [],
          message: formatSyncProgress(progress.processedCount, progress.totalCount),
          tone: progress.status === 'failed' ? 'error' : 'normal'
        });
      });
    } catch {
      unsubscribe = null;
    }
    try {
      setStatus(formatSyncResult(await input.onRunSync(payload)));
    } catch (error) {
      setStatus({
        failedSources: [],
        message: resolveErrorMessage(error),
        tone: 'error'
      });
    } finally {
      unsubscribe?.();
      setIsSyncing(false);
    }
  }

  return {
    isManualSyncing: isSyncing,
    manualSyncStatus: status,
    runManualSync
  };
}
