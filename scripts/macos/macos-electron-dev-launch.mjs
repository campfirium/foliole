/* global AbortController, process, URL */

import { spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  processIsAlive,
  readElectronDevSnapshot,
  waitForElectronDevCondition
} from '../desktop/electron-dev-control-state.mjs';

const ENTRY_FILE = fileURLToPath(new URL('./macos-electron-dev.mjs', import.meta.url));
// Covers the resource-gate queue, the Electron shell compile and the supervisor's own 60s ready wait.
const DEFAULT_LAUNCH_TIMEOUT_MS = 5 * 60 * 1000;

export function resolveMacosElectronDevLauncherLogFile(paths) {
  return path.join(path.dirname(paths.dailyLogFile), 'detached-launch.log');
}

/**
 * Starts the DEV supervisor in its own session so DEV outlives whoever ran `open`,
 * then returns once the new runtime reports ready.
 */
export async function launchDetachedMacosElectronDev({
  argv = [],
  env = process.env,
  isAlive = processIsAlive,
  paths,
  spawn = nodeSpawn,
  timeoutMs = DEFAULT_LAUNCH_TIMEOUT_MS,
  waitForCondition = waitForElectronDevCondition
}) {
  const logFile = resolveMacosElectronDevLauncherLogFile(paths);
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.mkdirSync(path.dirname(paths.appReadyFile), { recursive: true });
  const logFd = fs.openSync(logFile, 'a');
  let child;
  try {
    child = spawn(process.execPath, [ENTRY_FILE, 'start', ...argv], {
      cwd: paths.appRoot,
      detached: true,
      env,
      stdio: ['ignore', logFd, logFd]
    });
  } finally {
    fs.closeSync(logFd);
  }
  const controller = new AbortController();
  const onExit = (code, signal) => {
    controller.abort(new Error(`DEV supervisor exited before ready (code=${code ?? 'none'} signal=${signal ?? 'none'}); see ${logFile}`));
  };
  child.once('exit', onExit);
  child.once('error', (error) => controller.abort(error));
  child.unref();
  try {
    return await waitForCondition({
      evaluate: () => {
        const snapshot = readElectronDevSnapshot(paths, isAlive);
        return snapshot.running && snapshot.client?.supervisorPid === child.pid ? snapshot : null;
      },
      label: 'macOS Electron DEV detached launch',
      stateRoot: paths.dailyRoot,
      additionalRoots: [path.dirname(paths.appReadyFile)],
      signal: controller.signal,
      timeoutMs
    });
  } finally {
    child.off('exit', onExit);
  }
}
