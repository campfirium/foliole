import {
  tryForegroundAutoSync,
  type ForegroundAutoSyncOutcome,
  type TryForegroundAutoSyncArgs
} from './companionWorkspaceSyncFlow';

export function runCompanionSyncCoordinator(
  args: TryForegroundAutoSyncArgs
): Promise<ForegroundAutoSyncOutcome> {
  return tryForegroundAutoSync(args);
}
