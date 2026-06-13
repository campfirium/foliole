// @vitest-environment node
/* global process */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

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
        WINDOWS_PREVIEW_TIMEOUT_SECONDS: '2',
        WINDOWS_PREVIEW_TIMEOUT_STATUS_SECONDS: '2',
        WINDOWS_PREVIEW_TIMEOUT_START_SECONDS: '3',
        WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS: '3',
        WINDOWS_STARTUP_DIAGNOSTICS_SCRIPT: path.join(os.tmpdir(), 'missing-windows-startup-diagnostics.mjs'),
        ...env
      }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code, stderr, stdout });
    });
  });
}

async function createMockScripts(root) {
  const syncScript = path.join(root, 'mock-sync.sh');
  const clientScript = path.join(root, 'mock-client.sh');
  const freshnessScript = path.join(root, 'mock-freshness.mjs');
  const actionLog = path.join(root, 'actions.log');
  await writeFile(syncScript, '#!/usr/bin/env bash\necho "[windows-sync] status: SYNCED"\n', 'utf8');
  await writeFile(
    clientScript,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'echo "${WINDOWS_CLIENT_ACTION}" >> "${ACTION_LOG}"',
      'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
      '  echo "[windows-restart-client] status: RUNNING trust=OK"',
      '  exit 0',
      'fi',
      'if [ "${WINDOWS_CLIENT_ACTION}" = "full-restart" ]; then',
      '  echo "[windows-restart-client] status: RESTARTED"',
      '  exit 0',
      'fi',
      'exit 1'
    ].join('\n'),
    'utf8'
  );
  await writeFile(freshnessScript, 'process.stdout.write("[check-electron-dist-fresh] status: FRESH\\n");\n', 'utf8');
  await writeFile(actionLog, '', 'utf8');
  return { actionLog, clientScript, freshnessScript, syncScript };
}

async function readActions(actionLog) {
  return (await readFile(actionLog, 'utf8')).trim().split('\n').filter(Boolean);
}

it('chooses full restart for an explicit preview refresh without file changes', { timeout: 30000 }, async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-explicit-refresh-'));
  try {
    const { actionLog, clientScript, freshnessScript, syncScript } = await createMockScripts(tempRoot);
    const result = await runScript({
      ACTION_LOG: actionLog,
      WINDOWS_CLIENT_SCRIPT: clientScript,
      WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
      WINDOWS_PREVIEW_CHANGED_FILES: 'scripts/windows/windows-preview-explicit-refresh.test.mjs',
      WINDOWS_PREVIEW_REQUIRE_REFRESH: '1',
      WINDOWS_RESTART_INTENT_ROOT: tempRoot,
      WINDOWS_SYNC_SCRIPT: syncScript
    });

    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('reason: Class A: explicit preview shell restart requested');
    expect(result.stdout).toContain('selected action: full-restart');
    expect(result.stdout).toContain('[windows-preview] status: STARTED');
    expect(await readActions(actionLog)).toEqual(['status', 'full-restart']);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});
