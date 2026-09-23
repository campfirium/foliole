/* global console */

import path from 'node:path';

import { runMacosA5SyncGroupMaintenance } from '../sync-group/a5-sync-group-action.mjs';
import { macosAcceptanceEnv } from '../sync-group/multi-device-sync-macos-channel.mjs';

const ACCEPTANCE_APP_ID = 'com.foliole.android.acceptance';
const MAIN_COMPONENT = 'com.foliole.android/com.foliole.android.MainActivity';

export async function readA5AcceptanceSyncEvents(args, runAction = runMacosA5SyncGroupMaintenance) {
  args.assertFixed();
  const env = { ...macosAcceptanceEnv(args.env),
    FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID: ACCEPTANCE_APP_ID };
  args.checked(args.paths.gradle, ['--no-daemon', 'assembleDebugAndroidTest'], {
    cwd: path.join(args.paths.buildRoot, 'android'), env
  });
  const evidenceRoot = path.join(args.paths.artifactsRoot,
    'a5-acceptance-sync-events', args.buildIdentity());
  let failure;
  let result;
  try {
    result = await runAction({ action: 'read-sync-events', appId: ACCEPTANCE_APP_ID,
      buildIdentity: path.basename(evidenceRoot), env, evidenceRoot,
      execute: args.execute, installMain: false, paths: args.paths, serial: args.serial });
  } catch (error) { failure = error; }
  try {
    args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'start', '-W',
      '-n', MAIN_COMPONENT]);
  } catch (error) {
    if (!failure) throw error;
    failure.foregroundRestoreError = error;
  }
  if (failure) throw failure;
  console.log(`[macos-a5-dev] acceptance-sync-events=${result.manifestPath}`);
  return result;
}
