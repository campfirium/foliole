import type { Dispatch, SetStateAction } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';

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
  const report = await loadCompanionStateAfterStructureSyncReport();
  if (!active()) return;
  if (report.fallbackReason) {
    args.setError?.('sync_display_unavailable');
    return;
  }
  args.setState(current => active()
    ? { ...current, workspace_snapshot: report.state?.workspace_snapshot ?? null } : current);
  if (!active()) return;
  await Promise.allSettled([hydrateCompanionReviewSchedulerSettings(), hydrateCompanionSystemEntryDisplayNames()]);
}
