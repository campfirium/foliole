// @vitest-environment node
/* global process */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
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
  const root = await mkdtemp(path.join(os.tmpdir(), 'preview-command-timeout-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Preview Test']);
  await writeFile(path.join(root, 'tracked.txt'), 'base\n', 'utf8');
  git(root, ['add', 'tracked.txt']);
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

async function readHash(repoRoot) {
  return readFile(path.join(repoRoot, '.lab', 'internal', 'runtime', 'windows-preview.hash'), 'utf8');
}

describe('preview-dedupe command timeout', () => {
  it('fails a hung preview command with the script-owned command timeout', async () => {
    const repoRoot = await createRepo();
    try {
      await writeFile(path.join(repoRoot, 'tracked.txt'), 'changed\n', 'utf8');

      const result = await runDedupe(repoRoot, [process.execPath, '-e', 'setTimeout(() => {}, 1000)'], {
        PREVIEW_DEDUPE_WINDOWS_COMMAND_TIMEOUT_MS: '40'
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('[preview-dedupe] command timed out after 40ms');
      await expect(readHash(repoRoot)).rejects.toThrow();
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  });
});
