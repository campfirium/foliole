/* global clearTimeout, console, process, setTimeout */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { killPid } from '../lib/process-control.mjs';

export const DEFAULT_FILE_TIMEOUT_MS = 8 * 60_000;

function stopFileProcess(pid) {
  if (process.platform === 'win32') return killPid(pid);
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

export async function runHostedDesktopTestFile({ args, file, report, timeoutMs = DEFAULT_FILE_TIMEOUT_MS }) {
  const started = performance.now();
  const child = spawn(process.execPath, args, {
    detached: process.platform !== 'win32',
    stdio: 'inherit'
  });
  let timer;
  const closed = new Promise(resolve => {
    child.once('error', error => {
      console.error(error.message);
      resolve(1);
    });
    child.once('close', status => resolve(status ?? 1));
  });
  const deadline = new Promise(resolve => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  const result = await Promise.race([closed, deadline]);
  clearTimeout(timer);
  const timedOut = result === null;
  if (timedOut) {
    console.error(`[desktop-source] timed out after ${timeoutMs}ms: ${file}`);
    await stopFileProcess(child.pid);
    await closed;
  }
  const code = result ?? 1;
  writeFileSync(`${report}.execution.json`, JSON.stringify({
    file, platform: process.platform, durationMs: Math.round(performance.now() - started),
    timeoutMs, status: timedOut ? 'timeout' : code === 0 ? 'passed' : 'failed'
  }));
  return timedOut ? 1 : code;
}
