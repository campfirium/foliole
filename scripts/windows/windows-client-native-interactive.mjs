/* global process, setTimeout */

import { randomUUID } from 'node:crypto';

import { runCapture } from './windows-client-native-process.mjs';
import {
  INTERACTIVE_ACTIONS, interactiveStatePaths, readJson, WINDOWS_NATIVE_CLIENT_TASK,
  WINDOWS_NATIVE_CLIENT_WORKER_ENV, writeJsonAtomic
} from './windows-client-native-interactive-state.mjs';

const RESULT_TIMEOUT_MS = 90_000;
const START_TIMEOUT_MS = 5_000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertIdle(status) {
  if (status && ['pending', 'running'].includes(status.state)) {
    throw new Error(`native client interactive task is ${status.state}`);
  }
}

export async function installInteractiveTask({
  executionTimeLimitMinutes = 3, installScript, repoRoot, workerScript
}) {
  const result = await runCapture('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', installScript,
    '-NodePath', process.execPath, '-WorkDir', repoRoot, '-WorkerScript', workerScript,
    '-ExecutionTimeLimitMinutes', String(executionTimeLimitMinutes)
  ], { cwd: repoRoot, timeoutMs: 30_000 });
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || 'interactive task installation failed');
  }
}

export async function waitForInteractiveResult(paths, nonce, {
  now = Date.now, pause = wait, resultTimeoutMs = RESULT_TIMEOUT_MS,
  startTimeoutMs = START_TIMEOUT_MS
} = {}) {
  const startedAt = now();
  const deadline = startedAt + resultTimeoutMs;
  let workerStarted = false;
  while (now() < deadline) {
    const result = readJson(paths.result);
    if (result?.nonce === nonce) return result;
    const status = readJson(paths.status);
    if (status?.nonce === nonce && status.state === 'running') workerStarted = true;
    if (!workerStarted && now() - startedAt >= startTimeoutMs) {
      throw new Error('native client interactive task did not start within 5 seconds');
    }
    await pause(250);
  }
  throw new Error('native client interactive task result timed out');
}

export async function dispatchWindowsNativeClientAction({
  action, env = process.env, installScript, platform = process.platform, repoRoot, stateRoot, workerScript
}) {
  if (platform !== 'win32' || !INTERACTIVE_ACTIONS.has(action)
      || env[WINDOWS_NATIVE_CLIENT_WORKER_ENV] === '1') return false;
  const paths = interactiveStatePaths(stateRoot);
  assertIdle(readJson(paths.status));
  await installInteractiveTask({ installScript, repoRoot, workerScript });
  const request = { action, createdAt: new Date().toISOString(), nonce: randomUUID(), schemaVersion: 1 };
  writeJsonAtomic(paths.request, request);
  writeJsonAtomic(paths.status, { nonce: request.nonce, schemaVersion: 1, state: 'pending' });
  let result;
  try {
    const launch = await runCapture('schtasks.exe', ['/Run', '/TN', WINDOWS_NATIVE_CLIENT_TASK], {
      cwd: repoRoot, timeoutMs: 30_000
    });
    if (launch.code !== 0) {
      throw new Error(launch.stderr.trim() || launch.stdout.trim() || 'interactive task launch failed');
    }
    result = await waitForInteractiveResult(paths, request.nonce);
  } catch (error) {
    writeJsonAtomic(paths.status, {
      error: error.message, nonce: request.nonce, schemaVersion: 1, state: 'completed'
    });
    throw error;
  }
  if (result.output) process.stdout.write(result.output);
  if (result.exitCode !== 0) throw new Error(`interactive ${action} failed`);
  return true;
}
