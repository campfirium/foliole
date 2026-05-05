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

  await writeFile(actionLog, '', 'utf8');
  return { actionLog, clientScript, syncScript };
}

describe('windows-preview script', () => {
  it('restarts directly when electron files changed', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    try {
      const { syncScript, clientScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  echo "[windows-restart-client] status: RUNNING"',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "restart" ]; then',
          '  echo "[windows-restart-client] status: RESTARTED"',
          '  exit 0',
          'fi',
          'exit 1'
        ].join('\n')
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_PREVIEW_CHANGED_FILES: 'electron/ipc/fonts.ts'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('step 2/2: electron changes detected; evaluating client state');
      expect(result.stdout).toContain('windows client: RUNNING; restarting');
      expect(result.stdout).toContain('status: RESTARTED');
      await expect(readFile(actionLog, 'utf8')).resolves.toContain('restart');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('aborts on hmr path when status probe times out', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    try {
      const { syncScript, clientScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  sleep 2',
          '  echo "[windows-restart-client] status: RUNNING"',
          '  exit 0',
          'fi',
          'exit 1'
        ].join('\n')
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/app/App.tsx',
        WINDOWS_PREVIEW_TIMEOUT_SECONDS: '1'
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('status probe timed out (1s); aborting to avoid duplicate clients');
      const actions = (await readFile(actionLog, 'utf8'))
        .split('\n')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      expect(actions).toEqual(['status']);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('aborts on restart timeout to avoid launching duplicate clients', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    try {
      const { syncScript, clientScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  echo "[windows-restart-client] status: RUNNING"',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "restart" ]; then',
          '  sleep 2',
          '  echo "[windows-restart-client] status: RESTARTED"',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "start" ]; then',
          '  echo "[windows-restart-client] status: STARTED"',
          '  exit 0',
          'fi',
          'exit 0'
        ].join('\n')
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_PREVIEW_CHANGED_FILES: 'electron/main.ts',
        WINDOWS_PREVIEW_TIMEOUT_RESTART_SECONDS: '1'
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('restart timed out (1s); aborting to avoid duplicate clients');
      const actions = (await readFile(actionLog, 'utf8'))
        .split('\n')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      expect(actions).toContain('restart');
      expect(actions).not.toContain('start');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('aborts when restart reports failure and does not fall back to start', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-test-'));
    try {
      const { syncScript, clientScript, actionLog } = await createMockScripts(
        tempRoot,
        [
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  echo "[windows-restart-client] status: RUNNING"',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "restart" ]; then',
          '  echo "[windows-restart-client] status: RESTART_FAILED reason=runtime-not-detected"',
          '  exit 1',
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
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_PREVIEW_CHANGED_FILES: 'electron/main.ts'
      });

      expect(result.code).toBe(1);
      expect(result.stdout).toContain('windows client: restart failed; aborting to avoid duplicate clients');
      const actions = (await readFile(actionLog, 'utf8'))
        .split('\n')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      expect(actions).toEqual(['status', 'restart']);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
