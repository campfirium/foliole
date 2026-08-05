import fs from 'node:fs';
import path from 'node:path';

import {
  startWindowsA5LiveReloadServer, WINDOWS_A5_LIVE_RELOAD_PORT
} from './windows-a5-live-reload-server.mjs';
import { captureWindowsA5Screenshot } from './windows-a5-screenshot.mjs';

const APP_ID = 'com.foliole.android';
const COMPONENT = `${APP_ID}/com.foliole.android.MainActivity`;

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

export function isAndroidImeVisible(output) {
  return /\bmInputShown=true\b|\bmIsInputViewShown=true\b|\bmImeWindowVis=0x3\b/u.test(output);
}

async function verifySoftKeyboard(execute, paths, env, adbPort, serial) {
  const state = await checked(execute, paths.adbPath, adbArgs(adbPort, serial,
    ['shell', 'dumpsys', 'input_method']), adbOptions(env, 'live-input'), 'live-input');
  if (!isAndroidImeVisible(state.stdout)) {
    throw failure('A5 software keyboard did not become visible after the fixed input tap', 'live-input');
  }
}

function captureScreenshot(execute, paths, env, adbPort, serial, evidenceRoot) {
  return captureWindowsA5Screenshot({
    adbPort, env, evidenceRoot, execute, fileName: 'a5-live.png', paths,
    remotePath: '/sdcard/Download/foliole-a5-live.png', serial, stage: 'live-screenshot'
  });
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
  surface = 'current',
  verifyForeground
}) {
  let primaryError = null;
  let reverseConfigured = false;
  let result;
  const server = await startServer({
    buildIdentity, repoRoot: paths.repoRoot, surface,
    timeoutMs: surface === 'secondary' ? 120_000 : 45_000
  });
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
    const loadOutcome = server.waitForDeviceLoad().then(
      (loaded) => ({ loaded }), (error) => ({ error })
    );
    await checked(execute, paths.adbPath, adbArgs(adbPort, serial,
      ['shell', 'am', 'start', '-n', COMPONENT]), adbOptions(env, 'live-launch'), 'live-launch');
    let launched;
    if (surface === 'secondary') {
      const inputOutcome = server.waitForDeviceInput().then(
        (point) => ({ point }), (error) => ({ error })
      );
      const next = await Promise.race([loadOutcome, inputOutcome]);
      if (next.error) throw next.error;
      if (next.loaded) launched = next.loaded;
      else {
        const point = next.point;
        await checked(execute, paths.adbPath, adbArgs(adbPort, serial,
          ['shell', 'input', 'tap', String(point.x), String(point.y)]),
        adbOptions(env, 'live-input'), 'live-input');
        await verifySoftKeyboard(execute, paths, env, adbPort, serial);
        const afterInput = await loadOutcome;
        if (afterInput.error) throw afterInput.error;
        launched = afterInput.loaded;
      }
    } else {
      const outcome = await loadOutcome;
      if (outcome.error) throw outcome.error;
      launched = outcome.loaded;
    }
    await verifyForeground();
    const screenshotPath = await captureScreenshot(
      execute, paths, env, adbPort, serial, evidenceRoot
    );
    let acceptancePath;
    if (surface === 'secondary') {
      if (launched.acceptance?.status !== 'passed') {
        const detail = String(launched.acceptance?.error || 'unknown acceptance failure').slice(0, 500);
        throw failure(`A5 secondary acceptance failed: ${detail}`, 'live-acceptance');
      }
      acceptancePath = path.join(evidenceRoot, 'secondary-acceptance.json');
      fs.writeFileSync(acceptancePath, `${JSON.stringify(launched.acceptance, null, 2)}\n`, 'utf8');
    }
    result = {
      buildIdentity, deviceLoads: launched.sequence, screenshotPath, serverUrl: server.url,
      ...(acceptancePath ? { acceptancePath } : {})
    };
  } catch (error) {
    primaryError = error;
    try {
      const screenshotPath = await captureScreenshot(
        execute, paths, env, adbPort, serial, evidenceRoot
      );
      primaryError.liveReload = { buildIdentity, screenshotPath, serverUrl: server.url };
    } catch {
      // Preserve the primary lifecycle failure when diagnostic capture is unavailable.
    }
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
