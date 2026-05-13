// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
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
  return result.stdout;
}

async function createRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'preview-dedupe-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Preview Test']);
  await writeFile(path.join(root, '.gitignore'), 'before-run.hash\nruns.log\n', 'utf8');
  await writeFile(path.join(root, 'tracked.txt'), 'base\n', 'utf8');
  git(root, ['add', '.gitignore', 'tracked.txt']);
  git(root, ['commit', '-m', 'init']);
  return root;
}

function runDedupe(repoRoot, target, command, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [DEDUPE_SCRIPT, target, '--', ...command], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PREVIEW_DEDUPE_REPO_ROOT: repoRoot,
        PREVIEW_DEDUPE_RUNTIME_DIR: '.lab/internal/runtime',
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

async function readHash(repoRoot, target) {
  return readFile(path.join(repoRoot, '.lab', 'internal', 'runtime', `${target}-preview.hash`), 'utf8');
}

describe('preview-dedupe', () => {
  it('stores a new tracked diff after successful preview and skips the same hash later', async () => {
    const repoRoot = await createRepo();
    try {
      const runLog = path.join(repoRoot, 'runs.log');
      await writeFile(path.join(repoRoot, 'tracked.txt'), 'changed\n', 'utf8');

      const first = await runDedupe(repoRoot, 'windows', [
        'bash',
        '-c',
        'echo run >> runs.log && echo "[windows-preview] status: STARTED"'
      ]);
      const storedHash = await readHash(repoRoot, 'windows');
      expect(first.code).toBe(0);
      expect(first.stdout).toContain('[windows-preview] dedupe: claimed hash=');
      expect(first.stdout).toContain('[windows-preview] status: STARTED');
      expect(storedHash.trim()).not.toBe('');

      const second = await runDedupe(repoRoot, 'windows', ['bash', '-c', 'echo run >> runs.log'], {
        PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND: 'echo "[windows-restart-client] status: RUNNING"'
      });
      expect(second.code).toBe(0);
      expect(second.stdout).toContain('[windows-preview] dedupe: covered hash=');
      expect(second.stdout).toContain('[windows-preview] status: SYNCED');
      expect(await readFile(runLog, 'utf8')).toBe('run\n');
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  });

  it('runs a covered windows preview when the native runtime is stopped', async () => {
    const repoRoot = await createRepo();
    try {
      await writeFile(path.join(repoRoot, 'tracked.txt'), 'changed\n', 'utf8');

      const first = await runDedupe(repoRoot, 'windows', [
        'bash',
        '-c',
        'echo first >> runs.log && echo "[windows-preview] status: STARTED"'
      ]);
      const second = await runDedupe(repoRoot, 'windows', [
        'bash',
        '-c',
        'echo second >> runs.log && echo "[windows-preview] status: STARTED"'
      ], {
        PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND: 'echo "[windows-restart-client] status: STOPPED trust=FAILED reason=no-runtime"'
      });

      expect(first.code).toBe(0);
      expect(second.code).toBe(0);
      expect(second.stdout).toContain('[windows-preview] dedupe: stale-covered hash=');
      expect(second.stdout).toContain('[windows-preview] dedupe: claimed hash=');
      expect(second.stdout).toContain('[windows-preview] status: STARTED');
      expect(await readFile(path.join(repoRoot, 'runs.log'), 'utf8')).toBe('first\nsecond\n');
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  });

  it('does not mark a failed preview hash as covered', async () => {
    const repoRoot = await createRepo();
    try {
      await writeFile(path.join(repoRoot, 'tracked.txt'), 'changed\n', 'utf8');

      const first = await runDedupe(repoRoot, 'windows', ['bash', '-c', 'echo fail >> runs.log; exit 7']);
      expect(first.code).toBe(7);
      await expect(readHash(repoRoot, 'windows')).rejects.toThrow();

      const second = await runDedupe(repoRoot, 'windows', ['bash', '-c', 'echo pass >> runs.log']);
      expect(second.code).toBe(0);
      expect(second.stdout).toContain('[windows-preview] dedupe: claimed hash=');
      expect(await readFile(path.join(repoRoot, 'runs.log'), 'utf8')).toBe('fail\npass\n');
      expect((await readHash(repoRoot, 'windows')).trim()).not.toBe('');
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  });

  it('includes untracked files when matching the preview hash', async () => {
    const repoRoot = await createRepo();
    try {
      await mkdir(path.join(repoRoot, '.lab', 'internal', 'runtime'), { recursive: true });
      const first = await runDedupe(repoRoot, 'android', ['bash', '-c', 'echo run > runs.log']);
      const storedHash = await readHash(repoRoot, 'android');
      await mkdir(path.join(repoRoot, 'src', 'companion'), { recursive: true });
      await writeFile(path.join(repoRoot, 'src', 'companion', 'untracked.ts'), 'included\n', 'utf8');

      const second = await runDedupe(repoRoot, 'android', ['bash', '-c', 'echo second >> runs.log']);
      expect(first.code).toBe(0);
      expect(second.code).toBe(0);
      expect(second.stdout).toContain('[android-preview] dedupe: claimed hash=');
      expect(await readHash(repoRoot, 'android')).not.toBe(storedHash);
      expect(await readFile(path.join(repoRoot, 'runs.log'), 'utf8')).toBe('run\nsecond\n');
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  });

  it('ignores files outside the target preview surface', async () => {
    const repoRoot = await createRepo();
    try {
      await mkdir(path.join(repoRoot, 'src', 'app'), { recursive: true });
      await mkdir(path.join(repoRoot, 'src', 'companion'), { recursive: true });
      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 1;\n', 'utf8');
      await writeFile(path.join(repoRoot, 'src', 'companion', 'App.tsx'), 'export const companion = 1;\n', 'utf8');
      git(repoRoot, ['add', 'src/app/App.tsx', 'src/companion/App.tsx']);
      git(repoRoot, ['commit', '-m', 'add surfaces']);

      const first = await runDedupe(repoRoot, 'android', ['bash', '-c', 'echo run > runs.log']);
      const storedHash = await readHash(repoRoot, 'android');
      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 2;\n', 'utf8');

      const second = await runDedupe(repoRoot, 'android', ['bash', '-c', 'echo second >> runs.log']);
      expect(first.code).toBe(0);
      expect(second.code).toBe(0);
      expect(second.stdout).toContain('[android-preview] dedupe: covered hash=');
      expect(await readHash(repoRoot, 'android')).toBe(storedHash);
      expect(await readFile(path.join(repoRoot, 'runs.log'), 'utf8')).toBe('run\n');
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  });

  it('ignores gitignored untracked files when matching the preview hash', async () => {
    const repoRoot = await createRepo();
    try {
      await writeFile(path.join(repoRoot, '.gitignore'), 'before-run.hash\nruns.log\nignored.txt\n', 'utf8');
      git(repoRoot, ['add', '.gitignore']);
      git(repoRoot, ['commit', '-m', 'ignore file']);
      const first = await runDedupe(repoRoot, 'windows', ['bash', '-c', 'echo run > runs.log']);
      const storedHash = await readHash(repoRoot, 'windows');
      await writeFile(path.join(repoRoot, 'ignored.txt'), 'ignored\n', 'utf8');

      const second = await runDedupe(repoRoot, 'windows', ['bash', '-c', 'echo second >> runs.log'], {
        PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND: 'echo "[windows-restart-client] status: RUNNING"'
      });
      expect(first.code).toBe(0);
      expect(second.code).toBe(0);
      expect(second.stdout).toContain('[windows-preview] dedupe: covered hash=');
      expect(await readHash(repoRoot, 'windows')).toBe(storedHash);
      expect(await readFile(path.join(repoRoot, 'runs.log'), 'utf8')).toBe('run\n');
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  });
});
