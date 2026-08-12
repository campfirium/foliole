// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEDUPE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'preview', 'preview-dedupe.mjs');
const INTEGRATION_TIMEOUT_MS = 30_000;

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
  const root = await mkdtemp(path.join(os.tmpdir(), 'preview-batch-'));
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

function runDedupe(repoRoot, label, env, script = `echo ${label} >> runs.log && echo "[windows-preview] status: STARTED"`) {
  const previewEnv = {
    PREVIEW_DEDUPE_WINDOWS_SETTLE_MS: env.PREVIEW_DEDUPE_WINDOWS_SETTLE_MS ?? '0',
    PREVIEW_DEDUPE_WINDOWS_WINDOW_MS:
      env.PREVIEW_DEDUPE_WINDOWS_WINDOW_MS ?? env.PREVIEW_DEDUPE_WINDOWS_COOLDOWN_MS ?? '0',
    ...env
  };
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      DEDUPE_SCRIPT,
      'windows',
      '--',
      'bash',
      '-c',
      script
    ], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PREVIEW_DEDUPE_REPO_ROOT: repoRoot,
        PREVIEW_DEDUPE_RUNTIME_DIR: '.lab/internal/runtime',
        ...previewEnv
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

function runFailingDedupe(repoRoot, label, env) {
  return runDedupe(repoRoot, label, env, `echo ${label} >> runs.log; exit 7`);
}

describe('preview-dedupe batching', () => {
  it('lets a waiting request drive the next preview after the validation window', async () => {
    const repoRoot = await createRepo();
    try {
      const env = {
        PREVIEW_DEDUPE_WINDOWS_COOLDOWN_MS: '3000',
        PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND:
          'echo "[windows-restart-client] status: RUNNING trust=OK responding=True"'
      };

      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 2;\n', 'utf8');
      const first = await runDedupe(repoRoot, 'first', env);

      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 3;\n', 'utf8');
      const second = runDedupe(repoRoot, 'second', env);
      await delay(120);
      const third = runDedupe(repoRoot, 'third', env);

      const [secondResult, thirdResult] = await Promise.all([second, third]);

      expect(first.code).toBe(0);
      expect(secondResult.code).toBe(0);
      expect(thirdResult.code).toBe(0);
      expect(secondResult.stdout).toContain('[windows-preview] status: STARTED');
      expect(thirdResult.stdout).toContain('[windows-preview] status: STARTED');
      const runs = (await readFile(path.join(repoRoot, 'runs.log'), 'utf8')).trim().split('\n');
      expect(runs).toHaveLength(2);
      expect(runs[0]).toBe('first');
      expect(['second', 'third']).toContain(runs[1]);
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  }, 30_000);

  it('shares a failed batch result with other waiting requests for the same hash', async () => {
    const repoRoot = await createRepo();
    try {
      const env = {
        PREVIEW_DEDUPE_WAIT_ON_FAILURE: '0',
        PREVIEW_DEDUPE_WINDOWS_COOLDOWN_MS: '3000',
        PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND:
          'echo "[windows-restart-client] status: RUNNING trust=OK responding=True"'
      };

      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 2;\n', 'utf8');
      const first = await runDedupe(repoRoot, 'first', env);
      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 3;\n', 'utf8');
      const second = runFailingDedupe(repoRoot, 'second', env);
      await delay(120);
      const third = runFailingDedupe(repoRoot, 'third', env);

      const [secondResult, thirdResult] = await Promise.all([second, third]);

      expect(first.code).toBe(0);
      expect(secondResult.code).toBe(7);
      expect(thirdResult.code).toBe(7);
      const runs = (await readFile(path.join(repoRoot, 'runs.log'), 'utf8')).trim().split('\n');
      expect(runs).toHaveLength(2);
      expect(runs[0]).toBe('first');
      expect(['second', 'third']).toContain(runs[1]);
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  }, 30_000);

  it('keeps failed windows preview requests waiting when configured until a later preview succeeds', async () => {
    const repoRoot = await createRepo();
    try {
      const env = {
        PREVIEW_DEDUPE_WAIT_ON_FAILURE: '1',
        PREVIEW_DEDUPE_WINDOWS_COOLDOWN_MS: '180',
        PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND:
          'echo "[windows-restart-client] status: RUNNING trust=OK responding=True"'
      };

      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 2;\n', 'utf8');
      const first = await runDedupe(repoRoot, 'first', env);
      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 3;\n', 'utf8');
      const second = runFailingDedupe(repoRoot, 'second', env);
      await delay(1_000);
      const earlyResult = await Promise.race([
        second.then(() => 'settled'),
        delay(40).then(() => 'waiting')
      ]);

      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 4;\n', 'utf8');
      const third = runDedupe(repoRoot, 'third', env);
      const [secondResult, thirdResult] = await Promise.all([second, third]);

      expect(first.code).toBe(0);
      expect(earlyResult).toBe('waiting');
      expect(secondResult.code).toBe(0);
      expect(thirdResult.code).toBe(0);
      expect(secondResult.stdout).toContain('[windows-preview] status: STARTED');
      expect(await readFile(path.join(repoRoot, 'runs.log'), 'utf8')).toBe('first\nsecond\nthird\n');
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  }, 10_000);

  it('returns failed windows preview requests by default without waiting for a later success', async () => {
    const repoRoot = await createRepo();
    try {
      const env = {
        PREVIEW_DEDUPE_WINDOWS_COOLDOWN_MS: '180',
        PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND:
          'echo "[windows-restart-client] status: RUNNING trust=OK responding=True"'
      };

      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 2;\n', 'utf8');
      const result = await runFailingDedupe(repoRoot, 'first', env);

      expect(result.code).toBe(7);
      expect(result.stdout).not.toContain('reason=waiting-for-success');
      expect(await readFile(path.join(repoRoot, 'runs.log'), 'utf8')).toBe('first\n');
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  }, INTEGRATION_TIMEOUT_MS);

  it('runs a queued preview request after the active driver finishes', async () => {
    const repoRoot = await createRepo();
    try {
      const env = {
        PREVIEW_DEDUPE_WINDOWS_COOLDOWN_MS: '0',
        PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND:
          'echo "[windows-restart-client] status: RUNNING trust=OK responding=True"'
      };

      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 2;\n', 'utf8');
      const first = runDedupe(repoRoot, 'first', env, 'echo first >> runs.log; sleep 0.3; echo "[windows-preview] status: STARTED"');
      await vi.waitFor(async () => expect(JSON.parse(await readFile(
        path.join(repoRoot, '.lab/internal/runtime/windows-preview.state.json'), 'utf8'
      )).activeRunId).toBeTruthy());
      const second = runDedupe(repoRoot, 'second', env);

      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect(firstResult.code).toBe(0);
      expect(secondResult.code).toBe(0);
      expect(secondResult.stdout).toMatch(/requireActualPreview=true[\s\S]*\[windows-preview\] dedupe: claimed hash=/);
      expect(await readFile(path.join(repoRoot, 'runs.log'), 'utf8')).toBe('first\nsecond\n');
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  }, 10_000);

  it('does not open a validation window after a failed run', async () => {
    const repoRoot = await createRepo();
    try {
      const env = {
        PREVIEW_DEDUPE_WAIT_ON_FAILURE: '0',
        PREVIEW_DEDUPE_WINDOWS_COOLDOWN_MS: '220',
        PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND:
          'echo "[windows-restart-client] status: RUNNING trust=OK responding=True"'
      };

      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 2;\n', 'utf8');
      const first = await runFailingDedupe(repoRoot, 'first', env);
      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 3;\n', 'utf8');
      const second = await runDedupe(repoRoot, 'second', env);

      expect(first.code).toBe(7);
      expect(second.code).toBe(0);
      expect(await readFile(path.join(repoRoot, 'runs.log'), 'utf8')).toBe('first\nsecond\n');
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  }, 10_000);
});
