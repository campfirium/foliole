import { useState } from 'react';

import type { NativeReadwiseImportRunResult } from '../../../lib/platform/nativeImportContract';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import { refreshWorkspaceAfterReadwiseImport } from '../hooks/readwiseWorkspaceRefresh';

import type { useReadwiseSetupDraft } from './useReadwiseSetupDraft';
import {
  createReadwiseSetupPayload,
  enableReadwiseImportSource,
  type ReadwiseSetupPayload
} from './useReadwiseSyncPreviewFlow';

type ReadwiseSetupDraft = ReturnType<typeof useReadwiseSetupDraft>;

interface ReadwiseManualSyncFailedSource {
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

function toManualFailedSources(result: NativeReadwiseImportRunResult) {
  return (result.failed_sources ?? []).map((source) => ({
    reason: source.reason,
    sourceKind: source.source_kind,
    sourcePath: source.source_path
  }));
}

function formatSyncResult(result: NativeReadwiseImportRunResult | null, t: Translate): ReadwiseManualSyncStatus {
  if (!result) {
    return {
      failedSources: [],
      message: t('desktop.readwise.sync.unavailable'),
      tone: 'error'
    };
  }
  if (result.failed_count > 0 || result.status === 'failed') {
    return {
      failedSources: toManualFailedSources(result),
      message: t('desktop.readwise.sync.failedSources'),
      tone: 'error'
    };
  }
  if (typeof result.imported_count === 'number' && result.imported_count === 0) {
    return {
      failedSources: [],
      message: t('desktop.readwise.sync.noChanges'),
      tone: 'normal'
    };
  }
  if (typeof result.imported_count === 'number') {
    return {
      failedSources: [],
      message: t('desktop.readwise.sync.completed'),
      tone: 'normal'
    };
  }
  return {
    failedSources: [],
    message: t('desktop.readwise.sync.completed'),
    tone: 'normal'
  };
}

export function useReadwiseManualSync(input: {
  draft: ReadwiseSetupDraft;
  onRunSync?: (input: ReadwiseSetupPayload) => Promise<NativeReadwiseImportRunResult | null>;
}) {
  const t = useTranslation();
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
    setIsSyncing(true);
    setStatus({
      failedSources: [],
      message: t('desktop.readwise.sync.progress'),
      tone: 'normal'
    });
    try {
      const result = await input.onRunSync(payload);
      await refreshWorkspaceAfterReadwiseImport(result);
      setStatus(formatSyncResult(result, t));
    } catch {
      setStatus({
        failedSources: [],
        message: t('desktop.readwise.sync.failed'),
        tone: 'error'
      });
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
