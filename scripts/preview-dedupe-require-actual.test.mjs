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
  const root = await mkdtemp(path.join(os.tmpdir(), 'preview-require-actual-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Preview Test']);
  await writeFile(path.join(root, '.gitignore'), 'runs.log\n', 'utf8');
  await writeFile(path.join(root, 'tracked.txt'), 'base\n', 'utf8');
  git(root, ['add', '.gitignore', 'tracked.txt']);
  git(root, ['commit', '-m', 'init']);
  return root;
}

function startDedupe(repoRoot, label, command) {
  const child = spawn(process.execPath, [DEDUPE_SCRIPT, 'windows', '--', ...command], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PREVIEW_DEDUPE_REPO_ROOT: repoRoot,
      PREVIEW_DEDUPE_RUNTIME_DIR: '.lab/internal/runtime',
      PREVIEW_DEDUPE_WAIT_ANNOUNCE_MS: '40',
      PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND:
        'echo "[windows-restart-client] status: RUNNING trust=OK responding=True"',
      PREVIEW_DEDUPE_WINDOWS_SETTLE_MS: '0',
      PREVIEW_DEDUPE_WINDOWS_WINDOW_MS: '3000'
    }
  });
  const output = { label, stdout: '' };
  child.stdout.on('data', (chunk) => {
    output.stdout += chunk.toString();
  });
  const result = new Promise((resolve) => {
    child.on('close', (code) => resolve({ code, output }));
  });
  return { child, output, result };
}

async function waitForOutput(output, pattern, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pattern.test(output.stdout)) return;
    await delay(20);
  }
  throw new Error(`Timed out waiting for ${pattern}: ${output.stdout}`);
}

describe('preview-dedupe required real preview', () => {
  it('does not skip a covered windows hash when a queued request becomes the driver', async () => {
    const repoRoot = await createRepo();
    const runs = [];
    try {
      await writeFile(path.join(repoRoot, 'tracked.txt'), 'changed\n', 'utf8');
      const first = startDedupe(repoRoot, 'first', [
        'bash',
        '-c',
        'echo first >> runs.log; sleep 0.4; echo "[windows-preview] status: STARTED"'
      ]);
      runs.push(first);
      await waitForOutput(first.output, /requireActualPreview=false/);

      const second = startDedupe(repoRoot, 'second', [
        'bash',
        '-c',
        'echo second >> runs.log; echo "[windows-preview] status: STARTED"'
      ]);
      runs.push(second);
      await waitForOutput(second.output, /reason=active-run/);

      expect((await first.result).code).toBe(0);
      const secondResult = await second.result;
      expect(secondResult.code).toBe(0);
      expect(secondResult.output.stdout).toContain('requireActualPreview=true');
      expect(secondResult.output.stdout).toContain('[windows-preview] dedupe: claimed hash=');
      expect(secondResult.output.stdout).not.toContain('action=skip-real-preview');
      expect(await readFile(path.join(repoRoot, 'runs.log'), 'utf8')).toBe('first\nsecond\n');
    } finally {
      for (const run of runs) {
        run.child.kill();
      }
      await rm(repoRoot, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
    }
  }, 10_000);

  it('takes over a dead active driver immediately instead of waiting for the stale window', async () => {
    const repoRoot = await createRepo();
    const runs = [];
    try {
      const runtimeDir = path.join(repoRoot, '.lab', 'internal', 'runtime');
      await mkdir(runtimeDir, { recursive: true });
      await writeFile(path.join(runtimeDir, 'windows-preview.state.json'), `${JSON.stringify({
        acceptingUntil: 0,
        activeRunId: 'dead-run',
        nextRunId: null,
        runs: {
          'dead-run': {
            driverPid: 2147483647,
            driverRequestId: 'old-request',
            runId: 'dead-run',
            startedAt: Date.now(),
            status: 'running',
            waiters: ['old-request']
          }
        }
      })}\n`, 'utf8');

      const run = startDedupe(repoRoot, 'takeover', [
        'bash',
        '-c',
        'echo takeover >> runs.log; echo "[windows-preview] status: STARTED"'
      ]);
      runs.push(run);

      const result = await run.result;
      expect(result.code).toBe(0);
      expect(result.output.stdout).toContain('[windows-preview] dedupe: claimed hash=');
      expect(result.output.stdout).not.toContain('reason=active-run');
      expect(await readFile(path.join(repoRoot, 'runs.log'), 'utf8')).toBe('takeover\n');
    } finally {
      for (const run of runs) {
        run.child.kill();
      }
      await rm(repoRoot, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
    }
  }, 10_000);
});
