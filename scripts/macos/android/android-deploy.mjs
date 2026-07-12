/* global console, process */

import path from 'node:path';

import { resolveSerial, runAdb } from '../../android/android-adb-command.mjs';
import { runInherited } from '../../android/android-host-process.mjs';
import { requireTool, resolveAndroidTool } from './android-tools.mjs';

const APP_ID = 'com.foliole.android';
const COMPONENT = `${APP_ID}/com.foliole.android.MainActivity`;

export async function resolveMacDevice(env = process.env) {
  const adb = requireTool(resolveAndroidTool('adb', { env }), 'adb not found. Install Android platform-tools or set ADB_PATH/ANDROID_HOME.');
  const options = { adb, serial: env.FOLIOLE_ANDROID_SERIAL ?? env.ANDROID_SERIAL ?? '' };
  return { ...options, serial: await resolveSerial(options) };
}

export async function runMacDeploy(repoRoot, env = process.env) {
  if (env.FOLIOLE_ANDROID_PREVIEW_DEPLOY !== '1' && env.FOLIOLE_ANDROID_ALLOW_DIRECT_DEPLOY !== '1') {
    console.error('[android-deploy] refused: use android:preview or set FOLIOLE_ANDROID_ALLOW_DIRECT_DEPLOY=1.');
    return 2;
  }
  const device = await resolveMacDevice(env);
  let code = await runInherited('./gradlew', ['installDebug'], { cwd: path.join(repoRoot, 'android'), env });
  if (code !== 0) return code;
  try {
    await runAdb(device, ['reverse', 'tcp:38641', 'tcp:38641']);
  } catch {
    console.warn('[android-deploy] warning: adb reverse tcp:38641 failed');
  }
  await runAdb(device, ['shell', 'am', 'start', '-n', COMPONENT]);
  code = await runInherited(process.execPath, [
    path.join(repoRoot, 'scripts/android/verify-android-launch.mjs'),
    '--adb', device.adb, '--serial', device.serial, '--app-id', APP_ID, '--component', COMPONENT
  ], { cwd: repoRoot, env });
  if (code !== 0) return code;
  console.log(`[android-deploy] device: ${device.serial}`);
  console.log('[android-deploy] status: OPENED');
  return 0;
}
