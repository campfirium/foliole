// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEDUPE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'preview-dedupe.mjs');

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(result.stderr);
}

async function createRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'preview-head-hash-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Preview Test']);
  await writeFile(path.join(root, '.gitignore'), 'runs.log\n', 'utf8');
  await mkdir(path.join(root, 'src', 'app'), { recursive: true });
  await writeFile(path.join(root, 'src', 'app', 'App.tsx'), 'export const app = 1;\n', 'utf8');
  git(root, ['add', '.gitignore', 'src/app/App.tsx']);
  git(root, ['commit', '-m', 'init']);
  return root;
}

function runDedupe(repoRoot, label) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [DEDUPE_SCRIPT, 'windows', '--', 'bash', '-c', `echo ${label} >> runs.log`], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PREVIEW_DEDUPE_REPO_ROOT: repoRoot,
        PREVIEW_DEDUPE_RUNTIME_DIR: '.lab/internal/runtime',
        PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND:
          'echo "[windows-restart-client] status: RUNNING trust=OK responding=True"',
        PREVIEW_DEDUPE_WINDOWS_WINDOW_MS: '0'
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

describe('preview-dedupe committed target hash', () => {
  it('runs again after a committed target file changes even with a clean worktree', async () => {
    const repoRoot = await createRepo();
    try {
      const first = await runDedupe(repoRoot, 'first');
      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 2;\n', 'utf8');
      git(repoRoot, ['add', 'src/app/App.tsx']);
      git(repoRoot, ['commit', '-m', 'change app']);
      const second = await runDedupe(repoRoot, 'second');

      expect(first.code).toBe(0);
      expect(second.code).toBe(0);
      expect(second.stdout).toContain('[windows-preview] dedupe: claimed hash=');
      expect(await readFile(path.join(repoRoot, 'runs.log'), 'utf8')).toBe('first\nsecond\n');
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  });
});
