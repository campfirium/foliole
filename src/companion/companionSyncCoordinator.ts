import {
  hasPendingCompanionSyncGroupAdoption,
  readCompanionSyncGroupAdoptionRun,
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
      if (!await runPendingCompanionSyncGroupAdoption()) {
        if (!loadActiveCompanionSyncRun()) args.setStatus('idle');
        const run = readCompanionSyncGroupAdoptionRun();
        return run.phase !== 'none' && run.rejection?.code === 'request_sync_body_too_large' ? 'skipped' : 'pending';
      }
    } catch {
      if (!loadActiveCompanionSyncRun()) args.setStatus('idle');
      return 'failed';
    }
  }
  return tryForegroundAutoSync(args);
}
