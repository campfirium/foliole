/* global console */

import { spawnSync } from 'node:child_process';

import { closeMacosA5BuildCapsule } from './macos-a5-build-capsule.mjs';
import { closeMacosA5Run } from './macos-a5-execution-context.mjs';
import {
  markFormalA5Stage, recordFormalA5Cleanup, recordFormalA5LeaseReleased
} from './macos-a5-formal-receipt.mjs';
import { releaseMacosA5DeviceLease } from './macos-a5-run-lease.mjs';

export function shouldStopAdbServer(spawn = spawnSync) {
  const result = spawn('/usr/bin/pgrep', ['-x', 'scrcpy']);
  if (result.status === 1) return true;
  if (result.status !== 0) {
    console.warn('[macos-a5-dev] keeping adb: unable to inspect scrcpy process');
  }
  return false;
}

export function cleanupMacosA5Run({
  actionFailed, adb, context, deviceLeaseMode, lease, receipt, spawn = spawnSync
}) {
  try {
    if (receipt && !actionFailed) markFormalA5Stage(receipt, 'cleanup');
    if (deviceLeaseMode && shouldStopAdbServer(spawn)) spawn(adb, ['kill-server']);
    try {
      if (lease) {
        releaseMacosA5DeviceLease(lease);
        if (receipt) recordFormalA5LeaseReleased(receipt, lease);
      }
    } finally {
      try { closeMacosA5BuildCapsule(context); }
      finally { closeMacosA5Run(context); }
    }
    if (receipt) recordFormalA5Cleanup(receipt, 'complete');
    return null;
  } catch (error) {
    if (receipt) recordFormalA5Cleanup(receipt, 'failed');
    return error;
  }
}
