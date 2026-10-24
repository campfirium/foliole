/* global console */
import path from 'node:path';

import {
  COMPANION_LIVE_RELOAD_PORT, companionBundledEnv, companionLiveReloadEnv, runCompanionLiveSession
} from '../capacitor/companion-live-session.mjs';

import { A5_TEST_APP_ID } from './macos-a5-app-identity.mjs';
import { macosA5GradleEnv } from './macos-a5-runtime-paths.mjs';

const REVERSE = `tcp:${COMPANION_LIVE_RELOAD_PORT}`;

// Live reload replaces the installed shell, so it only ever targets the A5 test application.
export function assertLiveReloadTarget(applicationId) {
  if (applicationId !== A5_TEST_APP_ID) {
    throw new Error(`Live reload only installs the A5 test application, not ${applicationId}.`);
  }
}

function buildLiveShell({ captured, checked, env, paths }) {
  const live = companionLiveReloadEnv(env);
  checked('npm', ['run', 'android:web:build'], { cwd: paths.buildRoot, env });
  checked(paths.cap, ['sync', 'android'], { cwd: paths.buildRoot, env: live });
  checked(paths.gradle, ['--no-daemon', '--build-cache', 'assembleDebug'],
    { cwd: path.join(paths.buildRoot, 'android'), env: live });
  const gradleEnv = macosA5GradleEnv(env);
  const analyzer = path.join(gradleEnv.ANDROID_SDK_ROOT, 'cmdline-tools/latest/bin/apkanalyzer');
  assertLiveReloadTarget(captured(analyzer, ['manifest', 'application-id', paths.apk], { env: gradleEnv }));
}

export async function runMacosA5Live({ assertFixed, captured, checked, env, paths, serial }) {
  assertFixed(paths);
  buildLiveShell({ captured, checked, env, paths });
  const adb = (args) => checked(paths.adb, ['-s', serial, ...args]);
  await runCompanionLiveSession({
    root: paths.buildRoot,
    start: () => {
      adb(['install', '-r', paths.apk]);
      adb(['reverse', REVERSE, REVERSE]);
      adb(['shell', 'am', 'force-stop', A5_TEST_APP_ID]);
      adb(['shell', 'am', 'start', '-n', `${A5_TEST_APP_ID}/com.foliole.android.MainActivity`]);
    },
    restore: () => {
      try { adb(['reverse', '--remove', REVERSE]); } catch { /* ADB may already be gone. */ }
      checked(paths.cap, ['sync', 'android'], { cwd: paths.buildRoot, env: companionBundledEnv(env) });
      console.log('[macos-a5-dev] live reload stopped; the A5 test app still points at this Mac. '
        + 'Run `node scripts/android/macos-a5-dev.mjs deploy --identity test` to reinstall its bundled build.');
    }
  });
}
