// @vitest-environment node
/* global process */

import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEDUPE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'preview-dedupe.mjs');

function git(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    throw new Error(result.stderr);
  }
}

async function createRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'preview-dedupe-explicit-refresh-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Preview Test']);
  await writeFile(path.join(root, '.gitignore'), 'runs.log\n', 'utf8');
  await writeFile(path.join(root, 'tracked.txt'), 'base\n', 'utf8');
  git(root, ['add', '.gitignore', 'tracked.txt']);
  git(root, ['commit', '-m', 'init']);
  return root;
}

function runDedupe(repoRoot, command, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [DEDUPE_SCRIPT, 'windows', '--', ...command], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PREVIEW_DEDUPE_REPO_ROOT: repoRoot,
        PREVIEW_DEDUPE_RUNTIME_DIR: '.lab/internal/runtime',
        PREVIEW_DEDUPE_WAIT_ON_FAILURE: '0',
        PREVIEW_DEDUPE_WINDOWS_SETTLE_MS: '0',
        PREVIEW_DEDUPE_WINDOWS_WINDOW_MS: '0',
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

describe('preview-dedupe explicit refresh', () => {
  it('runs a covered windows preview and forwards the refresh env', async () => {
    const repoRoot = await createRepo();
    try {
      const runLog = path.join(repoRoot, 'runs.log');
      await writeFile(path.join(repoRoot, 'tracked.txt'), 'changed\n', 'utf8');

      const first = await runDedupe(repoRoot, [
        'bash',
        '-c',
        'echo first >> runs.log && echo "[windows-preview] status: STARTED"'
      ]);
      const second = await runDedupe(repoRoot, [
        'bash',
        '-c',
        'echo refresh=$WINDOWS_PREVIEW_REQUIRE_REFRESH >> runs.log && echo "[windows-preview] status: STARTED"'
      ], {
        PREVIEW_DEDUPE_REQUIRE_ACTUAL: '1',
        PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND: 'echo "[windows-restart-client] status: RUNNING trust=OK responding=True"'
      });

      expect(first.code).toBe(0);
      expect(second.code).toBe(0);
      expect(second.stdout).toContain('[windows-preview] dedupe: claimed hash=');
      expect(second.stdout).not.toContain('action=skip-real-preview');
      expect(await readFile(runLog, 'utf8')).toBe('first\nrefresh=1\n');
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  }, 15000);
});
