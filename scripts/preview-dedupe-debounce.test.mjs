// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readQuietMs } from './preview-debounce.mjs';

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
  return result.stdout;
}

async function createRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'preview-debounce-'));
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
    const child = spawn(process.execPath, [
      DEDUPE_SCRIPT,
      'windows',
      '--',
      'bash',
      '-c',
      `echo ${label} >> runs.log`
    ], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PREVIEW_DEDUPE_QUIET_MS: '120',
        PREVIEW_DEDUPE_REPO_ROOT: repoRoot,
        PREVIEW_DEDUPE_RUNTIME_DIR: '.lab/internal/runtime'
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

describe('preview-dedupe debounce', () => {
  it('defaults to a quiet window for every preview target', () => {
    expect(readQuietMs('windows', {})).toBe(60_000);
    expect(readQuietMs('android', {})).toBe(60_000);
  });

  it('allows the quiet window to be overridden for tests and local tuning', () => {
    expect(readQuietMs('windows', { PREVIEW_DEDUPE_QUIET_MS: '42' })).toBe(42);
    expect(readQuietMs('windows', { PREVIEW_DEDUPE_WINDOWS_QUIET_MS: '7' })).toBe(7);
  });

  it('runs only the latest preview request after the quiet window', async () => {
    const repoRoot = await createRepo();
    try {
      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 2;\n', 'utf8');
      const first = runDedupe(repoRoot, 'first');
      await delay(40);
      const second = runDedupe(repoRoot, 'second');

      const [firstResult, secondResult] = await Promise.all([first, second]);

      expect(firstResult.code).toBe(0);
      expect(secondResult.code).toBe(0);
      expect(firstResult.stdout).toContain('[windows-preview] debounce: superseded');
      expect(secondResult.stdout).toContain('[windows-preview] debounce: released');
      expect(await readFile(path.join(repoRoot, 'runs.log'), 'utf8')).toBe('second\n');
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  });
});
