/* global process */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

import {
  assertMacosA5ProductBootstrap, runMacosA5PairSyncPreflight
} from './macos-a5-pair-sync-preflight.mjs';

const A5_SERIAL = '87a33a4b';
const APP_ID = 'com.foliole.android';
const COMPONENT = `${APP_ID}/.MainActivity`;

function checked(command, args, options, run) {
  const result = run(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} failed with exit ${result.status}`);
  }
}

export function runMacosA5ProductBootstrap(paths, run = spawnSync) {
  checked(paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'force-stop', APP_ID], {}, run);
  checked(paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'start', '-n', COMPONENT], {}, run);
  checked(process.execPath, [
    path.join(paths.repoRoot, 'scripts/android/verify-android-launch.mjs'),
    '--adb', paths.adb, '--serial', A5_SERIAL, '--app-id', APP_ID,
    '--component', COMPONENT, '--timeout-seconds', '30', '--stability-seconds', '3'
  ], { cwd: paths.repoRoot }, run);
}

export function resolveMacosA5PairSyncReadiness(paths) {
  const before = runMacosA5PairSyncPreflight(paths);
  if (!before.requiresProductBootstrap) return before;
  runMacosA5ProductBootstrap(paths);
  return assertMacosA5ProductBootstrap(before, runMacosA5PairSyncPreflight(paths));
}
