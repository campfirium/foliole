/* global clearTimeout, process, setTimeout */

import { spawn } from 'node:child_process';

import { processAlive } from './windows-client-native-state.mjs';

const DEFAULT_TASKKILL_TIMEOUT_MS = 15000;

export function runCapture(command, args, options = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timeout = null;
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      resolve(result);
    };
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    if (options.timeoutMs > 0) {
      timeout = setTimeout(() => {
        child.kill();
        finish({
          code: 1,
          error: new Error(`${command} timed out after ${options.timeoutMs}ms`),
          stderr,
          stdout
        });
      }, options.timeoutMs);
      timeout.unref?.();
    }
    child.on('error', (error) => {
      finish({ code: 1, error, stderr, stdout });
    });
    child.on('exit', (code) => {
      finish({ code: code ?? 1, error: null, stderr, stdout });
    });
  });
}

export async function killPid(pid, options = {}) {
  if (!processAlive(pid)) {
    return;
  }
  const timeoutMs = options.timeoutMs ?? Number.parseInt(
    process.env.FOLIOLE_WINDOWS_TASKKILL_TIMEOUT_MS ?? String(DEFAULT_TASKKILL_TIMEOUT_MS),
    10
  );
  const result = await runCapture('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { timeoutMs });
  if (result.code !== 0 && processAlive(pid)) {
    const errorDetail = result.error instanceof Error ? result.error.message : '';
    const detail = `${result.stdout}${result.stderr}${errorDetail}`.split(/\r?\n/u).filter(Boolean).slice(-8).join(' ');
    throw new Error(`taskkill failed pid=${pid}${detail ? ` ${detail}` : ''}`);
  }
}
