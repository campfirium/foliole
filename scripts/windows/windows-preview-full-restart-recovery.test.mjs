// @vitest-environment node
/* global process */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREVIEW_SCRIPT = path.join(REPO_ROOT, 'scripts', 'windows', 'windows-preview.sh');

function runScript(env) {
  return new Promise((resolve) => {
    const child = spawn('bash', [PREVIEW_SCRIPT], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        WINDOWS_NATIVE_ABI_CHECK_COMMAND: 'true',
        WINDOWS_NODE_MODULES_CHECK_COMMAND: 'true',
        WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS: '1',
        WINDOWS_PREVIEW_TIMEOUT_SECONDS: '2',
        WINDOWS_PREVIEW_TIMEOUT_START_SECONDS: '3',
        WINDOWS_PREVIEW_TIMEOUT_STATUS_SECONDS: '2',
        ...env
      }
    });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code, stdout });
    });
  });
}

async function createMockScripts(root) {
  const actionLog = path.join(root, 'actions.log');
  const clientScript = path.join(root, 'mock-client.sh');
  const syncScript = path.join(root, 'mock-sync.sh');
  const freshnessScript = path.join(root, 'mock-freshness.mjs');

  await writeFile(actionLog, '', 'utf8');
  await writeFile(freshnessScript, 'process.stdout.write("[check-electron-dist-fresh] status: FRESH\\n");\n', 'utf8');
  await writeFile(syncScript, 'echo "[windows-sync] status: SYNCED"\n', 'utf8');
  await writeFile(
    clientScript,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'echo "${WINDOWS_CLIENT_ACTION}" >> "${ACTION_LOG}"',
      'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
      '  echo "[windows-restart-client] status: RUNNING trust=OK shell_pid=500 runtime_pid=501 head=current-head"',
      '  exit 0',
      'fi',
      'if [ "${WINDOWS_CLIENT_ACTION}" = "full-restart" ]; then',
      '  sleep 5',
      'fi',
      'exit 1'
    ].join('\n'),
    'utf8'
  );

  return { actionLog, clientScript, freshnessScript, syncScript };
}

async function readActions(actionLog) {
  return (await readFile(actionLog, 'utf8')).trim().split('\n').filter(Boolean);
}

describe('windows preview full restart recovery', () => {
  it('accepts a trusted running client when full restart output times out after recovery', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-full-restart-'));
    try {
      const { actionLog, clientScript, freshnessScript, syncScript } = await createMockScripts(tempRoot);
      const result = await runScript({
        ACTION_LOG: actionLog,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_PREVIEW_CHANGED_FILES: 'vite.config.ts',
        WINDOWS_SYNC_SCRIPT: syncScript
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('selected action: full-restart');
      expect(result.stdout).toContain('full restart failed');
      expect(result.stdout).toContain('full restart recovered via trusted running status');
      expect(result.stdout).toContain('status: STARTED');
      expect(await readActions(actionLog)).toEqual(['status', 'full-restart', 'status']);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
