import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  installInteractiveTask, waitForInteractiveResult
} from './windows-client-native-interactive.mjs';
import { WINDOWS_NATIVE_CLIENT_TASK } from './windows-client-native-interactive-state.mjs';
import { resolveWindowsNativePaths } from './windows-native-paths.mjs';
import {
  syncGroupInteractivePaths, WINDOWS_SYNC_GROUP_INTERACTIVE_ACTIONS,
  writeJsonAtomic
} from './windows-sync-group-interactive-state.mjs';

const RESULT_TIMEOUT_MS = 20 * 60_000;

export async function runWindowsSyncGroupInteractiveAction(options, {
  installTask = installInteractiveTask, waitForResult = waitForInteractiveResult
} = {}) {
  if (!WINDOWS_SYNC_GROUP_INTERACTIVE_ACTIONS.has(options.action)) return null;
  const native = resolveWindowsNativePaths(options.paths.repoRoot);
  const paths = syncGroupInteractivePaths(options.paths.repoRoot);
  await installTask({
    executionTimeLimitMinutes: 20,
    installScript: native.nativeTaskInstallScript,
    repoRoot: options.paths.repoRoot,
    workerScript: path.join(options.paths.repoRoot, 'scripts', 'windows',
      'windows-sync-group-interactive-worker.mjs')
  });
  const request = {
    action: options.action, buildIdentity: options.buildIdentity,
    createdAt: new Date().toISOString(), evidenceRoot: options.evidenceRoot,
    nonce: randomUUID(), schemaVersion: 1
  };
  fs.rmSync(paths.providerRelease, { force: true });
  writeJsonAtomic(paths.request, request);
  writeJsonAtomic(paths.status, { nonce: request.nonce, schemaVersion: 1, state: 'pending' });
  const launch = await options.execute('schtasks.exe', ['/Run', '/TN', WINDOWS_NATIVE_CLIENT_TASK], {
    cwd: options.paths.repoRoot, timeoutCode: 'sync_group_interactive_start_timeout',
    timeoutMs: 30_000, windowsHide: true
  });
  if (launch.code !== 0) throw new Error('Sync Group interactive task launch failed.');
  const result = await waitForResult(paths, request.nonce, {
    resultTimeoutMs: RESULT_TIMEOUT_MS
  });
  if (result.exitCode !== 0) throw new Error(result.error || `interactive ${options.action} failed`);
  return result.actionResult;
}
