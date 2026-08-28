#!/usr/bin/env node
/* global console, process, URL */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { executeBounded } from './windows-bounded-process.mjs';
import { WINDOWS_NATIVE_CLIENT_WORKER_ENV } from './windows-client-native-interactive-state.mjs';
import { runWindowsSyncGroupDeviceAction } from './windows-sync-group-device-actions.mjs';
import { windowsDevPaths } from './windows-dev-paths.mjs';
import {
  readJson, syncGroupInteractivePaths, validateSyncGroupInteractiveRequest,
  validateSyncGroupInteractiveProgress, WINDOWS_SYNC_GROUP_INTERACTIVE_WORKER_ENV,
  writeJsonAtomic, writeSyncGroupInteractiveFatal
} from './windows-sync-group-interactive-state.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const state = syncGroupInteractivePaths(repoRoot);

async function main() {
  const request = validateSyncGroupInteractiveRequest(readJson(state.request), repoRoot);
  const progress = [];
  const reportProgress = (value) => {
    progress.push(validateSyncGroupInteractiveProgress(value, request.action));
    writeJsonAtomic(state.status, {
      nonce: request.nonce, progress, schemaVersion: 1, state: 'running'
    });
  };
  writeJsonAtomic(state.status, {
    nonce: request.nonce, progress, schemaVersion: 1,
    startedAt: new Date().toISOString(), state: 'running', workerPid: process.pid
  });
  let completed;
  try {
    const runtimePaths = windowsDevPaths({ repoRoot });
    const actionResult = await runWindowsSyncGroupDeviceAction({
      action: request.action, buildIdentity: request.buildIdentity,
      evidenceRoot: request.evidenceRoot, execute: executeBounded,
      expectedGroupId: request.expectedGroupId, expectedGroupTag: request.expectedGroupTag,
      paths: runtimePaths, reportProgress,
      selfcheckMode: request.selfcheckMode
    });
    completed = { actionResult, exitCode: 0, nonce: request.nonce, workerPid: process.pid,
      progress, schemaVersion: 1, state: 'completed' };
  } catch (error) {
    completed = { error: error instanceof Error ? error.message : String(error), exitCode: 1,
      nonce: request.nonce, progress, schemaVersion: 1, state: 'completed', workerPid: process.pid };
  }
  writeJsonAtomic(state.result, { ...completed, completedAt: new Date().toISOString() });
  writeJsonAtomic(state.status, { ...completed, completedAt: new Date().toISOString() });
  process.exit(completed.exitCode);
}

process.env[WINDOWS_SYNC_GROUP_INTERACTIVE_WORKER_ENV] = '1';
process.env[WINDOWS_NATIVE_CLIENT_WORKER_ENV] = '1';
let fatalHandled = false;
function handleFatal(error) {
  if (fatalHandled) return;
  fatalHandled = true;
  try { writeSyncGroupInteractiveFatal(state, error, process.pid); }
  catch (writeError) {
    console.error(`[windows-sync-group-interactive] fatal receipt failed: ${writeError.message}`);
  }
  console.error(`[windows-sync-group-interactive] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
process.once('uncaughtException', handleFatal);
process.once('unhandledRejection', handleFatal);
main().catch((error) => {
  handleFatal(error);
});
