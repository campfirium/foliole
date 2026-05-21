/* global clearTimeout, process, setTimeout */

import { spawn } from 'node:child_process';

import { processAlive } from './windows-client-native-state.mjs';

const DEFAULT_PROCESS_EXIT_TIMEOUT_MS = 15000;

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
      setTimeout(() => {
        child.stdout?.destroy();
        child.stderr?.destroy();
        resolve({ ...result, stderr, stdout });
      }, 50);
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

async function waitForProcessExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processAlive(pid)) {
      return true;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }
  return !processAlive(pid);
}

export async function killPid(pid, options = {}) {
  if (!processAlive(pid)) {
    return;
  }
  if (process.platform === 'win32') {
    const result = await runCapture('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      timeoutMs: options.timeoutMs ?? Number.parseInt(
        process.env.FOLIOLE_WINDOWS_PROCESS_EXIT_TIMEOUT_MS ?? String(DEFAULT_PROCESS_EXIT_TIMEOUT_MS),
        10
      )
    });
    if (result.code === 0 || !processAlive(pid)) {
      return;
    }
    throw new Error(`process tree terminate failed pid=${pid} ${result.stderr.trim() || result.stdout.trim()}`);
  }
  const timeoutMs = options.timeoutMs ?? Number.parseInt(
    process.env.FOLIOLE_WINDOWS_PROCESS_EXIT_TIMEOUT_MS ?? String(DEFAULT_PROCESS_EXIT_TIMEOUT_MS),
    10
  );
  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    if (!processAlive(pid)) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`process terminate failed pid=${pid} ${message}`);
  }
  if (!await waitForProcessExit(pid, timeoutMs)) {
    throw new Error(`process terminate timed out pid=${pid}`);
  }
}
