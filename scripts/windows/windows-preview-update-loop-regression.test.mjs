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
const RESTART_INTENT_FILE = '.windows-dev-restart-intent.json';

function runScript(env) {
  return new Promise((resolve) => {
    const child = spawn('bash', [PREVIEW_SCRIPT], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env }
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
      resolve({ code, stdout, stderr });
    });
  });
}

async function createMockScripts(root, clientBody) {
  const syncScript = path.join(root, 'mock-sync.sh');
  const clientScript = path.join(root, 'mock-client.sh');
  const freshnessScript = path.join(root, 'mock-freshness.mjs');
  const actionLog = path.join(root, 'actions.log');

  await writeFile(
    syncScript,
    ['#!/usr/bin/env bash', 'set -euo pipefail', 'echo "[windows-sync] status: SYNCED"'].join('\n'),
    'utf8'
  );
  await writeFile(
    clientScript,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'echo "${WINDOWS_CLIENT_ACTION}" >> "${ACTION_LOG}"',
      clientBody
    ].join('\n'),
    'utf8'
  );
  await writeFile(freshnessScript, 'process.stdout.write("[check-electron-dist-fresh] status: FRESH\\n");\n', 'utf8');
  await writeFile(actionLog, '', 'utf8');

  return { actionLog, clientScript, freshnessScript, syncScript };
}

async function readActions(actionLog) {
  return (await readFile(actionLog, 'utf8'))
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

async function readRestartIntent(rootDir) {
  return JSON.parse(await readFile(path.join(rootDir, RESTART_INTENT_FILE), 'utf8'));
}

describe('windows-preview update loop regressions', () => {
  it('classifies mixed renderer and electron changes as Class B restart-intent', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-regression-'));
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  echo "[windows-restart-client] status: RUNNING head=current-head"',
          '  exit 0',
          'fi',
          'exit 1'
        ].join('\n')
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_RESTART_INTENT_ROOT: tempRoot,
        WINDOWS_PREVIEW_CURRENT_HEAD: 'current-head',
        WINDOWS_PREVIEW_CHANGED_FILES: ['src/app/App.tsx', 'electron/preload.ts'].join('\n')
      });

      const restartIntent = await readRestartIntent(tempRoot);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('reason: Class B: working tree electron changes detected');
      expect(result.stdout).toContain('selected action: restart-intent');
      expect(restartIntent).toMatchObject({
        nonce: 1,
        head: 'current-head',
        reason: 'Class B: working tree electron changes detected'
      });
      expect(await readActions(actionLog)).toEqual(['status']);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('chooses fallback-start when the client is stopped even with electron changes', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-regression-'));
    try {
      const { syncScript, clientScript, freshnessScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  echo "[windows-restart-client] status: STOPPED reason=no-runtime"',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "start" ]; then',
          '  echo "[windows-restart-client] status: STARTED"',
          '  exit 0',
          'fi',
          'exit 1'
        ].join('\n')
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        WINDOWS_ELECTRON_DIST_FRESHNESS_SCRIPT: freshnessScript,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_RESTART_INTENT_ROOT: tempRoot,
        WINDOWS_PREVIEW_CHANGED_FILES: 'electron/main.ts'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('reason: Class C: no trusted running client');
      expect(result.stdout).toContain('selected action: fallback-start');
      expect(result.stdout).not.toContain('selected action: restart-intent');
      expect(await readActions(actionLog)).toEqual(['status', 'start']);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
