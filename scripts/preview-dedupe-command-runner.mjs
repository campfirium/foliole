/* global clearTimeout, console, process, setTimeout */

import { spawn, spawnSync } from 'node:child_process';

import { readDurationMs } from './preview-dedupe-time-budget.mjs';

const DEFAULT_COMMAND_TIMEOUT_MS = { android: 4 * 60_000, windows: 4 * 60_000 };

function readCommandTimeoutMs(target, env = process.env) {
  return readDurationMs(
    env,
    `PREVIEW_DEDUPE_${target.toUpperCase()}_COMMAND_TIMEOUT_MS`,
    readDurationMs(env, 'PREVIEW_DEDUPE_COMMAND_TIMEOUT_MS', DEFAULT_COMMAND_TIMEOUT_MS[target] ?? 4 * 60_000)
  );
}

function killChildProcess(child) {
  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  child.kill();
}

export function runPreviewCommand(command, target, cwd = process.cwd()) {
  const timeoutMs = readCommandTimeoutMs(target);
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(command[0], command.slice(1), {
      cwd,
      env: process.env,
      stdio: 'inherit'
    });
    const timeout =
      timeoutMs > 0
        ? setTimeout(() => {
            if (settled) return;
            console.error(`[preview-dedupe] command timed out after ${timeoutMs}ms`);
            killChildProcess(child);
            settled = true;
            resolve(1);
          }, timeoutMs)
        : null;
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve(signal ? 1 : code ?? 1);
    });
  });
}
