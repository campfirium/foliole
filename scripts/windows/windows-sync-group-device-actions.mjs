import { runWindowsSyncGroupBaselineReset } from './windows-sync-group-baseline-action.mjs';
import { runWindowsSyncGroupRecovery } from './windows-sync-group-recovery-action.mjs';

export async function runWindowsSyncGroupDeviceAction(options) {
  if (options.action === 'sync-group-baseline-reset') {
    return runWindowsSyncGroupBaselineReset(options);
  }
  if (options.action === 'sync-group-recover') return runWindowsSyncGroupRecovery(options);
  return null;
}
