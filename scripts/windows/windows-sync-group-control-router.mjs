import { runWindowsSyncGroupBaselineControl } from './windows-sync-group-baseline-control.mjs';
import { runWindowsSyncGroupRecoveryControl } from './windows-sync-group-recovery-control.mjs';
import { runWindowsSyncGroupTask3Control } from './windows-sync-group-task3-control.mjs';
import { runWindowsSyncGroupTask3ProtectControl } from './windows-sync-group-task3-protect-control.mjs';

const CONTROLS = {
  'sync-group-baseline-reset': runWindowsSyncGroupBaselineControl,
  'sync-group-recover': runWindowsSyncGroupRecoveryControl,
  'sync-group-task3': runWindowsSyncGroupTask3Control,
  'sync-group-task3-protect': runWindowsSyncGroupTask3ProtectControl
};

export function runWindowsSyncGroupControl(action, options) {
  const control = CONTROLS[action];
  return control ? control(options) : null;
}
