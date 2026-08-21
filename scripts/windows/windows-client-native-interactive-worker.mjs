#!/usr/bin/env node
/* global console, process, URL */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { executeBounded } from './windows-bounded-process.mjs';
import {
  interactiveStatePaths, readJson, validateInteractiveRequest, WINDOWS_NATIVE_CLIENT_WORKER_ENV,
  writeJsonAtomic
} from './windows-client-native-interactive-state.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const paths = interactiveStatePaths(path.join(repoRoot, '.tmp', 'windows-native-client-interactive'));

async function main() {
  const request = validateInteractiveRequest(readJson(paths.request));
  writeJsonAtomic(paths.status, {
    nonce: request.nonce, schemaVersion: 1, startedAt: new Date().toISOString(), state: 'running'
  });
  const clientScript = path.join(repoRoot, 'scripts', 'windows', request.action === 'internal-open'
    ? 'windows-internal-open.mjs' : 'windows-client-native.mjs');
  let result;
  try {
    const args = request.action === 'internal-open' ? [clientScript] : [clientScript, request.action];
    result = await executeBounded(process.execPath, args, {
      cwd: repoRoot,
      env: { ...process.env, [WINDOWS_NATIVE_CLIENT_WORKER_ENV]: '1' },
      timeoutCode: 'native_client_interactive_timeout',
      timeoutMs: 80_000,
      windowsHide: true
    });
  } catch (error) {
    result = { code: 1, output: error.output || error.message };
  }
  const completed = {
    completedAt: new Date().toISOString(), exitCode: result.code, nonce: request.nonce,
    output: result.output, schemaVersion: 1, state: 'completed'
  };
  writeJsonAtomic(paths.result, completed);
  writeJsonAtomic(paths.status, completed);
  process.exitCode = result.code;
}

main().catch((error) => {
  console.error(`[windows-native-task] ${error.message}`);
  process.exitCode = 1;
});
