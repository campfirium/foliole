// @vitest-environment node
/* global Buffer, process */

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
  const root = await mkdtemp(path.join(os.tmpdir(), 'preview-binary-hash-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Preview Test']);
  await writeFile(path.join(root, '.gitignore'), 'runs.log\n', 'utf8');
  await mkdir(path.join(root, 'android'), { recursive: true });
  await writeFile(path.join(root, 'android', 'asset.bin'), Buffer.alloc(16, 1));
  git(root, ['add', '.gitignore', 'android/asset.bin']);
  git(root, ['commit', '-m', 'init']);
  return root;
}

function runDedupe(repoRoot) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [DEDUPE_SCRIPT, 'android', '--', 'bash', '-c', 'echo run > runs.log'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PREVIEW_DEDUPE_REPO_ROOT: repoRoot,
        PREVIEW_DEDUPE_RUNTIME_DIR: '.lab/internal/runtime',
        PREVIEW_DEDUPE_WAIT_ON_FAILURE: '0',
        PREVIEW_DEDUPE_ANDROID_SETTLE_MS: '0',
        PREVIEW_DEDUPE_ANDROID_WINDOW_MS: '0'
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

describe('preview-dedupe binary hash', () => {
  it('hashes large binary tracked changes without reading binary diff output', async () => {
    const repoRoot = await createRepo();
    try {
      await writeFile(path.join(repoRoot, 'android', 'asset.bin'), Buffer.alloc(2 * 1024 * 1024, 2));

      const result = await runDedupe(repoRoot);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('[android-preview] dedupe: claimed hash=');
      expect(await readFile(path.join(repoRoot, 'runs.log'), 'utf8')).toBe('run\n');
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  });
});
