/* global process */

import fs from 'node:fs';
import path from 'node:path';

const MAIN_APP = 'com.foliole.android';
const CAPACITY_APP = 'com.foliole.android.acceptance';
const DRIVER_APPS = [
  'com.microsoft.playwright.androiddriver',
  'com.microsoft.playwright.androiddriver.test'
];

export function webViewSocketForPid(unixSockets, pid) {
  const expected = `webview_devtools_remote_${pid}`;
  const matches = unixSockets.split('\n').filter((line) => line.trimEnd().endsWith(expected));
  if (matches.length !== 1) throw new Error(`Expected one fixed A5 WebView socket for PID ${pid}.`);
  return expected;
}

function waitForSessionEnd() {
  return new Promise((resolve) => {
    const finish = () => {
      process.off('SIGINT', finish);
      process.off('SIGTERM', finish);
      process.stdin.off('end', finish);
      process.stdin.pause();
      resolve();
    };
    process.on('SIGINT', finish);
    process.on('SIGTERM', finish);
    process.stdin.on('end', finish);
    process.stdin.resume();
  });
}

export async function runT234WebViewSession({
  assertFixed, buildIdentity, captured, checked, paths, serial,
  waitForEnd = waitForSessionEnd
}) {
  const appId = CAPACITY_APP;
  assertFixed();
  const component = `${appId}/com.foliole.android.MainActivity`;
  const evidenceRoot = path.join(paths.artifactsRoot, 'a5-t234-webview-session', buildIdentity());
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const evidencePath = path.join(evidenceRoot, 'session.json');
  let session = { appId, serial, status: 'opening' };
  let failure;
  const save = () => fs.writeFileSync(evidencePath, `${JSON.stringify(session, null, 2)}\n`);
  save();
  try {
    checked(paths.adb, ['-s', serial, 'shell', 'am', 'start', '-W', '-n', component]);
    checked(process.execPath, [path.join(paths.buildRoot, 'scripts/android/verify-android-launch.mjs'),
      '--adb', paths.adb, '--serial', serial, '--app-id', appId,
      '--component', component, '--timeout-seconds', '30', '--stability-seconds', '3'],
    { cwd: paths.buildRoot });
    const pids = captured(paths.adb, ['-s', serial, 'shell', 'pidof', appId])
      .split(/\s+/u).filter(Boolean);
    if (pids.length !== 1 || !/^\d+$/u.test(pids[0])) {
      throw new Error(`Expected one fixed A5 process for ${appId}.`);
    }
    const socket = webViewSocketForPid(
      captured(paths.adb, ['-s', serial, 'shell', 'cat', '/proc/net/unix']), pids[0]
    );
    session = { appId, pid: Number(pids[0]), serial, socket, status: 'ready' };
    save();
    process.stdout.write(`[macos-a5-dev] t234-webview-session-ready=${evidencePath}\n`);
    await waitForEnd();
  }
  catch (error) {
    failure = error;
    session = { ...session, status: 'failed', error: error.message };
    save();
  }
  finally {
    let cleanupError;
    try {
      checked(paths.adb, ['-s', serial, 'shell', 'am', 'start', '-W', '-n',
        `${MAIN_APP}/com.foliole.android.MainActivity`]);
    } catch (error) { cleanupError = error; }
    for (const driverApp of DRIVER_APPS) {
      try {
        const installed = captured(paths.adb, ['-s', serial, 'shell', 'pm', 'list', 'packages', driverApp]);
        if (!installed.split('\n').includes(`package:${driverApp}`)) continue;
        checked(paths.adb, ['-s', serial, 'shell', 'am', 'force-stop', driverApp]);
        checked(paths.adb, ['-s', serial, 'shell', 'cmd', 'package', 'uninstall', driverApp]);
      } catch (error) { cleanupError ??= error; }
    }
    if (session.status === 'ready') session.status = cleanupError ? 'cleanup-failed' : 'closed';
    if (cleanupError) {
      session.cleanupError = cleanupError.message;
      failure ??= cleanupError;
    }
    save();
  }
  if (failure) throw failure;
}
