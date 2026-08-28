import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/* global process, setTimeout */

import {
  installInteractiveTask, waitForInteractiveResult
} from './windows-client-native-interactive.mjs';
import { WINDOWS_NATIVE_CLIENT_TASK } from './windows-client-native-interactive-state.mjs';
import { resolveWindowsNativePaths } from './windows-native-paths.mjs';
import { processAlive } from './windows-process-alive.mjs';
import {
  readJson, syncGroupInteractivePaths, WINDOWS_SYNC_GROUP_INTERACTIVE_ACTIONS,
  validateSyncGroupInteractiveProgress, writeJsonAtomic
} from './windows-sync-group-interactive-state.mjs';

const RESULT_TIMEOUT_MS = 20 * 60_000;
const TASK_TIMEOUT_MINUTES = 21;
const WORKER_EXIT_TIMEOUT_MS = 10_000;

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForInteractiveWorkerExit(workerPid, {
  isAlive = processAlive, now = Date.now, wait = pause
} = {}) {
  if (!Number.isInteger(workerPid) || workerPid <= 0) {
    throw new Error('Sync Group interactive worker did not report its process identity.');
  }
  const deadline = now() + WORKER_EXIT_TIMEOUT_MS;
  while (now() < deadline) {
    if (!isAlive(workerPid)) return;
    await wait(100);
  }
  throw new Error('Sync Group interactive worker did not exit after publishing its result.');
}

export async function runWindowsSyncGroupInteractiveEnvelope(options, {
  installTask = installInteractiveTask, waitForResult = waitForInteractiveResult,
  waitForWorkerExit = waitForInteractiveWorkerExit
} = {}) {
  if (!WINDOWS_SYNC_GROUP_INTERACTIVE_ACTIONS.has(options.action)) return null;
  const native = resolveWindowsNativePaths(options.paths.repoRoot);
  const paths = syncGroupInteractivePaths(options.paths.repoRoot);
  await installTask({
    executionTimeLimitMinutes: TASK_TIMEOUT_MINUTES,
    installScript: native.nativeTaskInstallScript,
    repoRoot: options.paths.repoRoot,
    workerScript: path.join(options.paths.repoRoot, 'scripts', 'windows',
      'windows-sync-group-interactive-worker.mjs')
  });
  const request = {
    action: options.action, buildIdentity: options.buildIdentity,
    createdAt: new Date().toISOString(), evidenceRoot: options.evidenceRoot,
    nonce: randomUUID(), schemaVersion: 1,
    ...(options.expectedGroupId ? { expectedGroupId: options.expectedGroupId } : {}),
    ...(options.expectedGroupTag ? { expectedGroupTag: options.expectedGroupTag } : {}),
    ...(options.selfcheckMode ? { selfcheckMode: options.selfcheckMode } : {})
  };
  fs.rmSync(paths.providerRelease, { force: true });
  writeJsonAtomic(paths.request, request);
  writeJsonAtomic(paths.status, { nonce: request.nonce, schemaVersion: 1, state: 'pending' });
  try {
    const launch = await options.execute('schtasks.exe', ['/Run', '/TN', WINDOWS_NATIVE_CLIENT_TASK], {
      cwd: options.paths.repoRoot, timeoutCode: 'sync_group_interactive_start_timeout',
      timeoutMs: 30_000, windowsHide: true
    });
    if (launch.code !== 0) throw new Error('Sync Group interactive task launch failed.');
    const result = await waitForResult(paths, request.nonce, {
      onProgress: (value) => {
        const progress = validateSyncGroupInteractiveProgress(value, request.action);
        const line = `[windows-dev-action] progress action=${request.action} nonce=${request.nonce}`
          + ` milestone=${progress.milestone} fact=${progress.factId}\n`;
        (options.stdout ?? process.stdout).write(line);
        if (progress.groupId) {
          (options.stdout ?? process.stdout).write(
            `[windows-dev-action] provider-ready group=${progress.groupId} tag=${progress.groupTag}\n`
          );
        }
      },
      resultTimeoutMs: RESULT_TIMEOUT_MS, startTimeoutMs: 30_000
    });
    await waitForWorkerExit(result.workerPid);
    return result;
  } catch (error) {
    const lifecycle = readJson(paths.status);
    const workerPid = lifecycle?.nonce === request.nonce ? lifecycle.workerPid : null;
    if (lifecycle?.state === 'running' && Number.isInteger(workerPid) && workerPid > 0) {
      await options.execute('schtasks.exe', ['/End', '/TN', WINDOWS_NATIVE_CLIENT_TASK], {
        cwd: options.paths.repoRoot, timeoutCode: 'sync_group_interactive_stop_timeout',
        timeoutMs: 30_000, windowsHide: true
      });
      await waitForWorkerExit(workerPid);
    }
    const completed = { completedAt: new Date().toISOString(), error: error.message,
      exitCode: 1, nonce: request.nonce, progress: lifecycle?.progress ?? [],
      schemaVersion: 1, state: 'completed', workerPid: workerPid ?? 0 };
    writeJsonAtomic(paths.result, completed);
    writeJsonAtomic(paths.status, completed);
    throw Object.assign(error, { interactiveTerminal: completed });
  }
}

export async function runWindowsSyncGroupInteractiveAction(options, dependencies) {
  const result = await runWindowsSyncGroupInteractiveEnvelope(options, dependencies);
  if (!result) return null;
  if (result.exitCode !== 0) throw new Error(result.error || `interactive ${options.action} failed`);
  return result.actionResult;
}
