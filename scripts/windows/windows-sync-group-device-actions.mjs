import { runWindowsSyncGroupBaselineReset } from './windows-sync-group-baseline-action.mjs';
import { runWindowsSyncGroupRecovery } from './windows-sync-group-recovery-action.mjs';
import { runWindowsSyncGroupTask3 } from './windows-sync-group-task3-action.mjs';
import { runWindowsSyncGroupTask3Protect } from './windows-sync-group-task3-protect-action.mjs';

export async function runWindowsSyncGroupDeviceAction(options) {
  if (options.action === 'sync-group-baseline-reset') {
    return runWindowsSyncGroupBaselineReset(options);
  }
  if (options.action === 'sync-group-recover') return runWindowsSyncGroupRecovery(options);
  if (options.action === 'sync-group-task3') return runWindowsSyncGroupTask3(options);
  if (options.action === 'sync-group-task3-protect') return runWindowsSyncGroupTask3Protect(options);
  return null;
}
