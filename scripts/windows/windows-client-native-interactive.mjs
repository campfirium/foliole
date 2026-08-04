/* global process, setTimeout */

import { randomUUID } from 'node:crypto';

import { runCapture } from './windows-client-native-process.mjs';
import {
  INTERACTIVE_ACTIONS, interactiveStatePaths, readJson, WINDOWS_NATIVE_CLIENT_TASK,
  WINDOWS_NATIVE_CLIENT_WORKER_ENV, writeJsonAtomic
} from './windows-client-native-interactive-state.mjs';

const RESULT_TIMEOUT_MS = 90_000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertIdle(status) {
  if (status && ['pending', 'running'].includes(status.state)) {
    throw new Error(`native client interactive task is ${status.state}`);
  }
}

async function installTask({ installScript, repoRoot, workerScript }) {
  const result = await runCapture('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', installScript,
    '-NodePath', process.execPath, '-WorkDir', repoRoot, '-WorkerScript', workerScript
  ], { cwd: repoRoot, timeoutMs: 30_000 });
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || 'interactive task installation failed');
  }
}

async function waitForResult(paths, nonce) {
  const deadline = Date.now() + RESULT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = readJson(paths.result);
    if (result?.nonce === nonce) return result;
    await wait(250);
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
  await installTask({ installScript, repoRoot, workerScript });
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
    result = await waitForResult(paths, request.nonce);
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
