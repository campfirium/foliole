import { useState } from 'react';

import type { NativeReadwiseImportRunResult } from '../../../lib/platform/nativeImportContract';

import type { useReadwiseSetupDraft } from './useReadwiseSetupDraft';
import {
  createReadwiseSetupPayload,
  enableReadwiseImportSource,
  type ReadwiseSetupPayload
} from './useReadwiseSyncPreviewFlow';

type ReadwiseSetupDraft = ReturnType<typeof useReadwiseSetupDraft>;

type ManualSyncStatus =
  | { message: string; tone: 'error' | 'normal' }
  | { message: null; tone: 'normal' };

function formatSyncResult(result: NativeReadwiseImportRunResult | null): ManualSyncStatus {
  if (!result) {
    return { message: 'Sync is only available in the desktop app.', tone: 'error' };
  }
  if (result.failed_count > 0 || result.status === 'failed') {
    return {
      message: `Sync finished with ${result.failed_count} failed source${
        result.failed_count === 1 ? '' : 's'
      }.`,
      tone: 'error'
    };
  }
  if (typeof result.imported_count === 'number' && result.imported_count === 0) {
    return { message: 'No new or changed Readwise sources.', tone: 'normal' };
  }
  if (typeof result.imported_count === 'number') {
    return {
      message: `Synced ${result.imported_count} Readwise source${
        result.imported_count === 1 ? '' : 's'
      }.`,
      tone: 'normal'
    };
  }
  return {
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
  const [status, setStatus] = useState<ManualSyncStatus>({
    message: null,
    tone: 'normal'
  });

  async function runManualSync() {
    if (!input.onRunSync || isSyncing) {
      return;
    }
    const payload = createReadwiseSetupPayload(
      input.draft,
      { ...input.draft.draftConfig, enabled: true },
      enableReadwiseImportSource(input.draft.draftSources)
    );
    setIsSyncing(true);
    setStatus({ message: 'Syncing Readwise sources...', tone: 'normal' });
    try {
      setStatus(formatSyncResult(await input.onRunSync(payload)));
    } catch (error) {
      setStatus({ message: resolveErrorMessage(error), tone: 'error' });
    } finally {
      setIsSyncing(false);
    }
  }

  return {
    isManualSyncing: isSyncing,
    manualSyncStatus: status,
    runManualSync
  };
}
