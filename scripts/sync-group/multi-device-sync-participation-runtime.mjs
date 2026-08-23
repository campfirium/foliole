import path from 'node:path';

import { runMacosA5SyncGroupMaintenance } from '../android/macos-a5-sync-group-maintenance-action.mjs';

export function runParticipantMaintenance(context, action, suffix = action) {
  return runMacosA5SyncGroupMaintenance({ action, buildIdentity: context.runId,
    env: context.env, evidenceRoot: path.join(context.evidenceRoot, suffix),
    execute: context.execute, paths: context.paths, serial: context.serial });
}

export async function restartAndroidParticipant({ appId, context, serial }) {
  const commands = [
    ['shell', 'am', 'force-stop', appId],
    ['shell', 'am', 'start', '-W', '-n', `${appId}/.MainActivity`]
  ];
  for (const args of commands) {
    const result = await context.execute(context.paths.adb, ['-s', serial, ...args], {
      env: context.env, timeoutMs: 60_000
    });
    if (result.code !== 0) throw Object.assign(new Error('Android participant restart failed.'), {
      failureOwner: 'controller', host: 'android-b', missingFact: 'android_restart', result
    });
  }
}
