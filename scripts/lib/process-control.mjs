/* global clearTimeout, process, setTimeout */

import { spawn } from 'node:child_process';

const DEFAULT_PROCESS_EXIT_TIMEOUT_MS = 15000;

export function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function runCapture(command, args, options = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timeout = null;
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      setTimeout(() => {
        child.stdout?.destroy();
        child.stderr?.destroy();
        resolve({ ...result, stderr, stdout });
      }, 50);
    };
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    if (options.timeoutMs > 0) {
      timeout = setTimeout(() => {
        child.kill();
        finish({ code: 1, error: new Error(`${command} timed out after ${options.timeoutMs}ms`) });
      }, options.timeoutMs);
      timeout.unref?.();
    }
    child.on('error', (error) => finish({ code: 1, error }));
    child.on('exit', (code) => finish({ code: code ?? 1, error: null }));
  });
}

async function waitForProcessExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return !processAlive(pid);
}

function resolveTimeout(options) {
  return options.timeoutMs ?? Number.parseInt(
    process.env.FOLIOLE_WINDOWS_PROCESS_EXIT_TIMEOUT_MS ?? String(DEFAULT_PROCESS_EXIT_TIMEOUT_MS),
    10
  );
}

export async function killPid(pid, options = {}) {
  if (!processAlive(pid)) return;
  const timeoutMs = resolveTimeout(options);
  if (process.platform === 'win32') {
    const result = await runCapture('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { timeoutMs });
    if (result.code === 0 || !processAlive(pid)) return;
    const fallback = await runCapture('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      `Stop-Process -Id ${pid} -Force -ErrorAction Stop`
    ], { timeoutMs });
    if (fallback.code === 0 || !processAlive(pid)) return;
    throw new Error(`process tree terminate failed pid=${pid} ${result.stderr.trim() || result.stdout.trim()}`);
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    if (!processAlive(pid)) return;
    throw new Error(`process terminate failed pid=${pid} ${error instanceof Error ? error.message : String(error)}`);
  }
  if (await waitForProcessExit(pid, timeoutMs)) return;
  process.kill(pid, 'SIGKILL');
  if (!await waitForProcessExit(pid, timeoutMs)) {
    throw new Error(`process terminate timed out pid=${pid}`);
  }
}
