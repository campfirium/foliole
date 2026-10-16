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
  const mutation = getCompanionSyncMutationRevision();
  const isCurrent = () => !args.cancelled() && generation === refreshGeneration
    && mutation === getCompanionSyncMutationRevision();
  const report = await loadCompanionStateAfterStructureSyncReport();
  if (!isCurrent()) return;
  if (report.fallbackReason) {
    args.setError?.('sync_display_unavailable');
    return;
  }
  const snapshot = report.state?.workspace_snapshot ?? null;
  args.setState(current => isCurrent() ? { ...current, workspace_snapshot: snapshot } : current);
  await Promise.allSettled([hydrateCompanionReviewSchedulerSettings(), hydrateCompanionSystemEntryDisplayNames()]);
}
