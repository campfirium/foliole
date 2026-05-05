import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import {
  syncCompanionObjectsFromDesktop,
  type CompanionDesktopSyncProgress
} from '../shared/platform/companionDesktopSyncObjects';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import {
  loadCompanionReadableArticle,
  loadCompanionWorkspaceSyncState,
  recordCompanionWorkspaceSyncEvent
} from '../shared/platform/companionWorkspaceSync';

import { resolveCompanionWorkspaceSyncEndpoint } from './companionWorkspaceSyncEndpoint';

export type CompanionWorkspaceSyncStatus = 'idle' | 'loading' | 'syncing';
export type ForegroundAutoSyncOutcome = 'completed' | 'failed' | 'skipped';

function describeSyncPassResult(result: {
  attachmentResourceError: string | null;
  contentBlobError: string | null;
  remainingAttachmentResourceBytes?: number | null;
  remainingAttachmentResourceCount: number | null;
  remainingContentBlobBytes?: number | null;
  remainingContentBlobCount: number | null;
}) {
  if (result.attachmentResourceError) {
    return {
      message: `Attachment cache failed: ${result.attachmentResourceError}`,
      outcome: 'failed' as const,
      status: 'failed' as const
    };
  }
  if (result.contentBlobError) {
    return {
      message: `Topic body cache failed: ${result.contentBlobError}`,
      outcome: 'failed' as const,
      status: 'failed' as const
    };
  }
  const remainingBodies = result.remainingContentBlobCount;
  const remainingAttachments = result.remainingAttachmentResourceCount;
  const bodyLabel = formatBacklogLabel('topic bodies', remainingBodies, result.remainingContentBlobBytes);
  const attachmentLabel = formatBacklogLabel('attachment files', remainingAttachments, result.remainingAttachmentResourceBytes);
  if (remainingBodies === 0 && remainingAttachments === 0) {
    return {
      message: 'Sync pass finished; topic bodies and attachment files are cached.',
      outcome: 'skipped' as const,
      status: 'skipped' as const
    };
  }
  if (remainingBodies === 0) {
    return {
      message: `Sync pass finished; ${attachmentLabel} still caching.`,
      outcome: 'skipped' as const,
      status: 'skipped' as const
    };
  }
  if (remainingAttachments === 0) {
    return {
      message: `Sync pass finished; ${bodyLabel} still caching.`,
      outcome: 'skipped' as const,
      status: 'skipped' as const
    };
  }
  return {
    message: `Sync pass finished; ${bodyLabel} and ${attachmentLabel} still caching.`,
    outcome: 'skipped' as const,
    status: 'skipped' as const
  };
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function formatBacklogLabel(label: string, count: number | null, bytes?: number | null) {
  const countLabel = count === null ? `some ${label}` : `${count} ${label}`;
  return typeof bytes === 'number' && bytes > 0 ? `${countLabel} (${formatBytes(bytes)})` : countLabel;
}

export async function syncReadableArticle(snapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot']) {
  return loadCompanionReadableArticle(snapshot);
}

export async function runCompanionStreamSync(args: {
  cancelled: () => boolean;
  endpointUrl: string;
  setReadableArticle(article: CompanionReadableArticle | null): void;
  setState(state: NativeCompanionWorkspaceSyncState): void;
  setSyncProgress(progress: CompanionDesktopSyncProgress | null): void;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
}) {
  const result = await syncCompanionObjectsFromDesktop(args.endpointUrl, {
    onProgress: args.setSyncProgress,
    onStructureSynced: async () => {
      if (args.cancelled()) {
        return;
      }
      const structureState = await loadCompanionWorkspaceSyncState();
      args.setState(structureState);
      args.setReadableArticle(await syncReadableArticle(structureState.workspace_snapshot));
    }
  });
  if (args.cancelled()) {
    return;
  }
  const passResult = describeSyncPassResult(result);
  const completedState = await recordCompanionWorkspaceSyncEvent({
    endpointUrl: args.endpointUrl,
    message: passResult.message,
    status: passResult.status
  });
  args.setState(completedState);
  args.setReadableArticle(await syncReadableArticle(completedState.workspace_snapshot));
  args.setStatus('idle');
  if (
    result.attachmentResourceError ||
    result.contentBlobError ||
    (result.remainingAttachmentResourceCount === 0 && result.remainingContentBlobCount === 0)
  ) {
    args.setSyncProgress(null);
  }
  return passResult.outcome;
}

export async function tryForegroundAutoSync(args: {
  cancelled: () => boolean;
  setError(error: string | null): void;
  setReadableArticle(article: CompanionReadableArticle | null): void;
  setState(state: NativeCompanionWorkspaceSyncState): void;
  setSyncProgress(progress: CompanionDesktopSyncProgress | null): void;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
  state: NativeCompanionWorkspaceSyncState;
}): Promise<ForegroundAutoSyncOutcome> {
  const endpointUrl = resolveCompanionWorkspaceSyncEndpoint(args.state);
  if (!endpointUrl) return 'skipped';
  args.setStatus('syncing');
  try {
    await recordCompanionWorkspaceSyncEvent({ endpointUrl, message: 'Auto sync started.', status: 'started' });
    return await runCompanionStreamSync({ ...args, endpointUrl }) ?? 'skipped';
  } catch (syncError) {
    if (args.cancelled()) return 'skipped';
    const message = syncError instanceof Error ? syncError.message : 'Desktop sync failed.';
    args.setStatus('idle');
    args.setSyncProgress(null);
    const failedState = await recordCompanionWorkspaceSyncEvent({ endpointUrl, message, status: 'failed' }).catch(() => null);
    if (failedState) args.setState(failedState);
    return 'failed';
  }
}
