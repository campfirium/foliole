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

describe('windows-preview desktop smoke wiring', () => {
  it('runs windows smoke before restoring a desktop-sensitive preview flow', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-preview-smoke-test-'));
    try {
      const actionLog = path.join(tempRoot, 'actions.log');
      const stateFile = path.join(tempRoot, 'state.txt');
      const syncScript = path.join(tempRoot, 'mock-sync.sh');
      const smokeScript = path.join(tempRoot, 'mock-smoke.sh');
      const clientScript = path.join(tempRoot, 'mock-client.sh');

      await writeFile(actionLog, '', 'utf8');
      await writeFile(stateFile, 'RUNNING', 'utf8');
      await writeFile(
        syncScript,
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'echo sync >> "${ACTION_LOG}"',
          'echo "[windows-sync] status: SYNCED"'
        ].join('\n'),
        'utf8'
      );
      await writeFile(
        smokeScript,
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'echo smoke >> "${ACTION_LOG}"',
          'echo "[windows-smoke] status: PASSED"'
        ].join('\n'),
        'utf8'
      );
      await writeFile(
        clientScript,
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'echo "${WINDOWS_CLIENT_ACTION}" >> "${ACTION_LOG}"',
          'state="$(cat "${STATE_FILE}")"',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "status" ]; then',
          '  echo "[windows-restart-client] status: ${state}"',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "stop" ]; then',
          '  printf "STOPPED" > "${STATE_FILE}"',
          '  echo "[windows-restart-client] status: STOPPED"',
          '  exit 0',
          'fi',
          'if [ "${WINDOWS_CLIENT_ACTION}" = "start" ]; then',
          '  printf "RUNNING" > "${STATE_FILE}"',
          '  echo "[windows-restart-client] status: STARTED"',
          '  exit 0',
          'fi',
          'exit 1'
        ].join('\n'),
        'utf8'
      );

      const result = await runScript({
        ACTION_LOG: actionLog,
        STATE_FILE: stateFile,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_SMOKE_SCRIPT: smokeScript,
        WINDOWS_CLIENT_SCRIPT: clientScript,
        WINDOWS_PREVIEW_CHANGED_FILES: 'src/shared/platform/bridge.ts'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('desktop-sensitive changes detected; running windows:smoke before manual acceptance');
      expect(result.stdout).toContain('status: SYNCED');
      const actions = (await readFile(actionLog, 'utf8'))
        .split('\n')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      expect(actions).toEqual(['sync', 'status', 'stop', 'smoke', 'status', 'start']);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
