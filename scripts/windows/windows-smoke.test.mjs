// @vitest-environment node
/* global process */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SMOKE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'windows', 'windows-smoke.sh');

function runScript(env) {
  return new Promise((resolve) => {
    const child = spawn('bash', [SMOKE_SCRIPT], {
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

describe('windows-smoke script', () => {
  it('syncs first and then runs the desktop smoke command', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-smoke-test-'));
    try {
      const actionLog = path.join(tempRoot, 'actions.log');
      const syncScript = path.join(tempRoot, 'mock-sync.sh');
      const runnerScript = path.join(tempRoot, 'mock-runner.sh');

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
        runnerScript,
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'echo smoke >> "${ACTION_LOG}"',
          'echo "[desktop-smoke] status: PASSED"'
        ].join('\n'),
        'utf8'
      );
      await writeFile(actionLog, '', 'utf8');

      const result = await runScript({
        ACTION_LOG: actionLog,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_SMOKE_RUNNER: `bash '${runnerScript}'`
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('step 1/2: sync to windows mirror');
      expect(result.stdout).toContain('step 2/2: run desktop smoke');
      expect(result.stdout).toContain('status: PASSED');
      const actions = (await readFile(actionLog, 'utf8'))
        .split('\n')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      expect(actions).toEqual(['sync', 'smoke']);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('can skip sync when the mirror is already up to date', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-smoke-test-'));
    try {
      const actionLog = path.join(tempRoot, 'actions.log');
      const syncScript = path.join(tempRoot, 'mock-sync.sh');
      const runnerScript = path.join(tempRoot, 'mock-runner.sh');

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
        runnerScript,
        [
          '#!/usr/bin/env bash',
          'set -euo pipefail',
          'echo smoke >> "${ACTION_LOG}"',
          'echo "[desktop-smoke] status: PASSED"'
        ].join('\n'),
        'utf8'
      );
      await writeFile(actionLog, '', 'utf8');

      const result = await runScript({
        ACTION_LOG: actionLog,
        WINDOWS_SYNC_SCRIPT: syncScript,
        WINDOWS_SMOKE_RUNNER: `bash '${runnerScript}'`,
        WINDOWS_SMOKE_SKIP_SYNC: '1'
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('reuse existing windows mirror sync');
      const actions = (await readFile(actionLog, 'utf8'))
        .split('\n')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      expect(actions).toEqual(['smoke']);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
