import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { syncCompanionObjectsFromDesktop } from '../shared/platform/companionDesktopSyncObjects';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import {
  loadCompanionReadableArticle,
  loadCompanionWorkspaceVersion,
  pullCompanionWorkspaceSnapshot,
  recordCompanionWorkspaceSyncEvent
} from '../shared/platform/companionWorkspaceSync';

import { shouldPullUpdatedDesktopSnapshot } from './companionAutoSync';

export type CompanionWorkspaceSyncStatus = 'idle' | 'loading' | 'syncing';

export async function syncReadableArticle(snapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot']) {
  return loadCompanionReadableArticle(snapshot);
}

export async function applyPulledSnapshot(args: {
  cancelled: () => boolean;
  endpointUrl: string;
  setReadableArticle(article: CompanionReadableArticle | null): void;
  setState(state: NativeCompanionWorkspaceSyncState): void;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
}) {
  const syncedState = await pullCompanionWorkspaceSnapshot(args.endpointUrl);
  await syncCompanionObjectsFromDesktop(args.endpointUrl);
  if (args.cancelled()) {
    return;
  }
  const completedState = await recordCompanionWorkspaceSyncEvent({
    endpointUrl: args.endpointUrl,
    message: 'Auto sync completed.',
    occurredAt: syncedState.last_synced_at ?? undefined,
    status: 'completed'
  });
  args.setState(completedState);
  args.setReadableArticle(await syncReadableArticle(completedState.workspace_snapshot));
  args.setStatus('idle');
}

export async function tryForegroundAutoSync(args: {
  cancelled: () => boolean;
  setError(error: string | null): void;
  setReadableArticle(article: CompanionReadableArticle | null): void;
  setState(state: NativeCompanionWorkspaceSyncState): void;
  setStatus(status: CompanionWorkspaceSyncStatus): void;
  state: NativeCompanionWorkspaceSyncState;
}) {
  const endpointUrl = args.state.endpoint_url;
  if (!endpointUrl) return;
  args.setStatus('syncing');
  args.setError(null);
  try {
    const version = await loadCompanionWorkspaceVersion(endpointUrl);
    if (!version.has_snapshot || !shouldPullUpdatedDesktopSnapshot({
      lastSyncedAt: args.state.last_synced_at,
      remoteExportedAt: version.exported_at
    })) {
      await syncCompanionObjectsFromDesktop(endpointUrl);
      if (!args.cancelled()) {
        const skippedState = await recordCompanionWorkspaceSyncEvent({
          endpointUrl,
          message: version.has_snapshot ? 'Checked desktop. No new changes.' : 'Checked desktop. No snapshot available.',
          status: 'skipped'
        });
        args.setState(skippedState);
        args.setStatus('idle');
      }
      return;
    }
    await recordCompanionWorkspaceSyncEvent({ endpointUrl, message: 'Auto sync started.', status: 'started' });
    await applyPulledSnapshot({ ...args, endpointUrl });
  } catch (syncError) {
    if (args.cancelled()) return;
    const message = syncError instanceof Error ? syncError.message : 'Desktop sync failed.';
    args.setStatus('idle');
    args.setError(message);
    const failedState = await recordCompanionWorkspaceSyncEvent({ endpointUrl, message, status: 'failed' }).catch(() => null);
    if (failedState) args.setState(failedState);
  }
}
