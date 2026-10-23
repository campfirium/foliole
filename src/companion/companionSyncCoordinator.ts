import {
  hasPendingCompanionSyncGroupAdoption,
  runPendingCompanionSyncGroupAdoption
} from '../shared/platform/companion/sync/companionSyncGroupAdoptionRun';

import { loadActiveCompanionSyncRun } from './companionSyncRunOwner';
import {
  tryForegroundAutoSync,
  type ForegroundAutoSyncOutcome,
  type TryForegroundAutoSyncArgs
} from './companionWorkspaceSyncFlow';

/** The single scheduler entry: an unfinished group adoption continues before ordinary sync. */
export async function runCompanionSyncCoordinator(
  args: TryForegroundAutoSyncArgs
): Promise<ForegroundAutoSyncOutcome> {
  if (hasPendingCompanionSyncGroupAdoption()) {
    args.setStatus('syncing');
    try {
      await runPendingCompanionSyncGroupAdoption();
    } catch {
      if (!loadActiveCompanionSyncRun()) args.setStatus('idle');
      return 'failed';
    }
  }
  return tryForegroundAutoSync(args);
}
