import fs from 'node:fs';
import path from 'node:path';

import {
  startWindowsA5LiveReloadServer, WINDOWS_A5_LIVE_RELOAD_PORT
} from './windows-a5-live-reload-server.mjs';

const APP_ID = 'com.foliole.android';
const COMPONENT = `${APP_ID}/com.foliole.android.MainActivity`;
const REMOTE_SCREENSHOT = '/sdcard/Download/foliole-a5-live.png';

function failure(message, stage, result) {
  return Object.assign(new Error(message), { exitCode: 74, result, stage });
}

async function checked(execute, command, args, options, stage) {
  const result = await execute(command, args, options);
  if (result.code === 0) return result;
  const detail = result.lines?.at(-1) || result.stderr || `${command} exited ${result.code}`;
  throw failure(String(detail).trim(), stage, result);
}

function adbArgs(adbPort, serial, args) {
  return ['-P', adbPort, '-s', serial, ...args];
}

function adbOptions(env, stage, timeoutMs = 30_000) {
  return { env, timeoutCode: `${stage}_timeout`, timeoutMs, windowsHide: true };
}

async function captureScreenshot(execute, paths, env, adbPort, serial, evidenceRoot) {
  const screenshotPath = path.join(evidenceRoot, 'a5-live.png');
  await checked(execute, paths.adbPath, adbArgs(adbPort, serial,
    ['shell', 'screencap', '-p', REMOTE_SCREENSHOT]), adbOptions(env, 'live-screenshot'), 'live-screenshot');
  try {
    await checked(execute, paths.adbPath, adbArgs(adbPort, serial,
      ['pull', REMOTE_SCREENSHOT, screenshotPath]), adbOptions(env, 'live-screenshot'), 'live-screenshot');
  } finally {
    await checked(execute, paths.adbPath, adbArgs(adbPort, serial,
      ['shell', 'rm', REMOTE_SCREENSHOT]), adbOptions(env, 'live-screenshot-cleanup'), 'live-screenshot-cleanup');
  }
  if (!fs.existsSync(screenshotPath)) throw failure('A5 screenshot was not written', 'live-screenshot');
  return screenshotPath;
}

export async function runWindowsA5LiveReload({
  adbPort,
  buildIdentity,
  env,
  evidenceRoot,
  execute,
  paths,
  serial,
  startServer = startWindowsA5LiveReloadServer,
  verifyForeground
}) {
  let primaryError = null;
  let reverseConfigured = false;
  let result;
  const server = await startServer({ buildIdentity, repoRoot: paths.repoRoot });
  try {
    const installed = await checked(execute, paths.adbPath, adbArgs(adbPort, serial,
      ['shell', 'pm', 'path', APP_ID]), adbOptions(env, 'live-package'), 'live-package');
    if (!installed.stdout.includes('package:')) throw failure('Fixed A5 debug shell is not installed', 'live-package');
    await checked(execute, paths.adbPath, adbArgs(adbPort, serial, [
      'reverse', `tcp:${WINDOWS_A5_LIVE_RELOAD_PORT}`, `tcp:${WINDOWS_A5_LIVE_RELOAD_PORT}`
    ]), adbOptions(env, 'live-reverse'), 'live-reverse');
    reverseConfigured = true;
    await checked(execute, paths.adbPath, adbArgs(adbPort, serial,
      ['shell', 'am', 'force-stop', APP_ID]), adbOptions(env, 'live-launch'), 'live-launch');
    const firstLoad = server.waitForDeviceLoad();
    await checked(execute, paths.adbPath, adbArgs(adbPort, serial,
      ['shell', 'am', 'start', '-n', COMPONENT]), adbOptions(env, 'live-launch'), 'live-launch');
    const launched = await firstLoad;
    const reloadedPromise = server.waitForDeviceLoad(launched.sequence);
    server.reload();
    const reloaded = await reloadedPromise;
    await verifyForeground();
    const screenshotPath = await captureScreenshot(
      execute, paths, env, adbPort, serial, evidenceRoot
    );
    result = {
      buildIdentity, deviceLoads: reloaded.sequence, screenshotPath, serverUrl: server.url
    };
  } catch (error) {
    primaryError = error;
  }
  let cleanupError = null;
  if (reverseConfigured) {
    try {
      await checked(execute, paths.adbPath, adbArgs(adbPort, serial,
        ['reverse', '--remove', `tcp:${WINDOWS_A5_LIVE_RELOAD_PORT}`]),
      adbOptions(env, 'live-reverse-cleanup'), 'live-reverse-cleanup');
    } catch (error) { cleanupError = error; }
  }
  try { await server.close(); } catch (error) {
    cleanupError ??= failure(`Companion DEV server cleanup failed: ${error.message}`, 'live-server-cleanup');
  }
  if (cleanupError) throw cleanupError;
  if (primaryError) throw primaryError;
  return {
    liveReload: result,
    output: `[a5-live] identity=${result.buildIdentity} loads=${result.deviceLoads} cleanup=complete screenshot=${result.screenshotPath}\n`
  };
}
