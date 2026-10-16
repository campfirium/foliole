import type { Dispatch, SetStateAction } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { getCompanionSyncMutationRevision } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';

import { hydrateCompanionReviewSchedulerSettings } from './companionReviewSchedulerSettingsHydration';
import { loadCompanionStateAfterStructureSyncReport } from './companionStructureSyncSnapshot';
import { hydrateCompanionSystemEntryDisplayNames } from './companionSystemEntryDisplayNamesHydration';

let refreshGeneration = 0;

export async function refreshCompanionSyncDisplay(args: {
  cancelled(): boolean;
  setState: Dispatch<SetStateAction<NativeCompanionWorkspaceSyncState>>;
  setError?(message: string | null): void;
}) {
  const generation = ++refreshGeneration;
  const active = () => !args.cancelled() && generation === refreshGeneration;
  let retryQueued = false;
  const retry = () => {
    if (retryQueued || !active()) return;
    retryQueued = true;
    queueMicrotask(() => {
      if (active()) void refreshCompanionSyncDisplay(args).catch(() => args.setError?.('sync_display_unavailable'));
    });
  };
  while (active()) {
    const mutation = getCompanionSyncMutationRevision();
    const report = await loadCompanionStateAfterStructureSyncReport();
    if (!active()) return;
    if (mutation !== getCompanionSyncMutationRevision()) continue;
    if (report.fallbackReason) {
      args.setError?.('sync_display_unavailable');
      return;
    }
    const snapshot = report.state?.workspace_snapshot ?? null;
    args.setState(current => {
      if (!active()) return current;
      if (mutation !== getCompanionSyncMutationRevision()) { retry(); return current; }
      return { ...current, workspace_snapshot: snapshot };
    });
    break;
  }
  if (!active()) return;
  await Promise.allSettled([hydrateCompanionReviewSchedulerSettings(), hydrateCompanionSystemEntryDisplayNames()]);
}
