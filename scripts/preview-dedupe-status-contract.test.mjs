// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEDUPE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'preview-dedupe.mjs');

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(result.stderr);
}

async function createRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'preview-status-'));
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

function startDedupe(repoRoot, command, env = {}, target = 'windows') {
  const child = spawn(process.execPath, [DEDUPE_SCRIPT, target, '--', ...command], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PREVIEW_DEDUPE_REPO_ROOT: repoRoot,
      PREVIEW_DEDUPE_RUNTIME_DIR: '.lab/internal/runtime',
      PREVIEW_DEDUPE_WAIT_ANNOUNCE_MS: '40',
      PREVIEW_DEDUPE_ANDROID_COOLDOWN_MS: '0',
      PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND:
        'echo "[windows-restart-client] status: RUNNING trust=OK responding=True"',
      PREVIEW_DEDUPE_WINDOWS_SETTLE_MS: '0',
      ...env
    }
  });
  const output = { stdout: '' };
  child.stdout.on('data', (chunk) => {
    output.stdout += chunk.toString();
  });
  const result = new Promise((resolve) => {
    child.on('close', (code) => {
      output.closed = true;
      resolve({ code, output });
    });
  });
  return { child, output, result };
}

async function removeRepo(repoRoot) {
  await rm(repoRoot, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
}

async function waitForOutput(output, pattern, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pattern.test(output.stdout)) return;
    await delay(20);
  }
  throw new Error(`Timed out waiting for output ${pattern}: ${output.stdout}`);
}

async function stopRuns(runs) {
  for (const run of runs) {
    if (!run.output.closed) {
      run.child.kill();
    }
    await Promise.race([run.result, delay(500)]);
  }
}

describe('preview-dedupe status contract', () => {
  it('does not print a success status while a validation-window request is waiting', async () => {
    const repoRoot = await createRepo();
    const runs = [];
    try {
      const env = {
        PREVIEW_DEDUPE_WINDOWS_COOLDOWN_MS: '3000',
        PREVIEW_DEDUPE_WINDOWS_WINDOW_MS: '3000'
      };
      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 2;\n', 'utf8');
      const first = startDedupe(repoRoot, [
        'bash',
        '-c',
        'echo first >> runs.log && echo "[windows-preview] status: STARTED"'
      ], env);
      runs.push(first);
      expect((await first.result).code).toBe(0);

      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 3;\n', 'utf8');
      const second = startDedupe(repoRoot, [
        'bash',
        '-c',
        'echo second >> runs.log && echo "[windows-preview] status: STARTED"'
      ], env);
      runs.push(second);
      await waitForOutput(second.output, /reason=validation-window/);

      expect(second.output.stdout).toContain('reason=validation-window');
      expect(second.output.stdout).not.toMatch(/^\[windows-preview\] status: STARTED$/m);
      expect((await second.result).code).toBe(0);
      expect(second.output.stdout).toMatch(/^\[windows-preview\] status: STARTED$/m);
    } finally {
      await stopRuns(runs);
      await removeRepo(repoRoot);
    }
  }, 10_000);

  it('keeps waiting-for-success visible without printing success before a later run passes', async () => {
    const repoRoot = await createRepo();
    const runs = [];
    try {
      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 2;\n', 'utf8');
      const first = startDedupe(repoRoot, ['bash', '-c', 'echo fail >> runs.log; exit 7'], {
        PREVIEW_DEDUPE_WAIT_ON_FAILURE: '1'
      });
      runs.push(first);
      await waitForOutput(first.output, /reason=waiting-for-success/, 3_000);
      await delay(260);

      expect(first.output.stdout).toContain('reason=waiting-for-success');
      expect(first.output.stdout.match(/reason=waiting-for-success/g)?.length ?? 0).toBeGreaterThan(1);
      expect(first.output.stdout).not.toMatch(/^\[windows-preview\] status: STARTED$/m);

      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 3;\n', 'utf8');
      const second = startDedupe(repoRoot, [
        'bash',
        '-c',
        'echo pass >> runs.log && echo "[windows-preview] status: STARTED"'
      ]);
      runs.push(second);

      expect((await second.result).code).toBe(0);
      expect((await first.result).code).toBe(0);
      expect(first.output.stdout).toMatch(/^\[windows-preview\] status: STARTED$/m);
    } finally {
      await stopRuns(runs);
      await removeRepo(repoRoot);
    }
  }, 10_000);

  it('prints a stable android success status from the dedupe layer', async () => {
    const repoRoot = await createRepo();
    const runs = [];
    try {
      const run = startDedupe(repoRoot, ['bash', '-c', 'echo android >> runs.log'], {}, 'android');
      runs.push(run);

      expect((await run.result).code).toBe(0);
      expect(run.output.stdout).toMatch(/^\[android-preview\] status: SYNCED$/m);
      expect(await readFile(path.join(repoRoot, 'runs.log'), 'utf8')).toBe('android\n');
    } finally {
      await stopRuns(runs);
      await removeRepo(repoRoot);
    }
  }, 10_000);

  it('drives a real preview for a covered windows hash when the runtime is stale', async () => {
    const repoRoot = await createRepo();
    const runs = [];
    try {
      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 2;\n', 'utf8');
      const noWindow = { PREVIEW_DEDUPE_WINDOWS_WINDOW_MS: '0' };
      const first = startDedupe(repoRoot, ['bash', '-c', 'echo first >> runs.log'], noWindow);
      runs.push(first);
      expect((await first.result).code).toBe(0);

      const second = startDedupe(repoRoot, ['bash', '-c', 'echo second >> runs.log'], {
        ...noWindow,
        PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND:
          'echo "[windows-restart-client] status: STOPPED trust=FAILED reason=no-runtime"'
      });
      runs.push(second);

      expect((await second.result).code).toBe(0);
      expect(second.output.stdout).toContain('[windows-preview] dedupe: stale-covered hash=');
      expect(second.output.stdout).toContain('[windows-preview] dedupe: claimed hash=');
      expect(second.output.stdout).toMatch(/^\[windows-preview\] status: STARTED$/m);
      const eventLog = await readFile(path.join(repoRoot, '.lab', 'internal', 'runtime', 'windows-preview.events.jsonl'), 'utf8');
      expect(eventLog).toContain('"event":"real-preview-claimed"');
      expect(await readFile(path.join(repoRoot, 'runs.log'), 'utf8')).toBe('first\nsecond\n');
    } finally {
      await stopRuns(runs);
      await removeRepo(repoRoot);
    }
  }, 10_000);
});
