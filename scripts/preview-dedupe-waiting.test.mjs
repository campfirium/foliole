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
  const root = await mkdtemp(path.join(os.tmpdir(), 'preview-waiting-'));
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

function runDedupe(repoRoot, label, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      DEDUPE_SCRIPT,
      'windows',
      '--',
      'bash',
      '-c',
      `echo ${label} >> runs.log && echo "[windows-preview] status: STARTED"`
    ], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PREVIEW_DEDUPE_REPO_ROOT: repoRoot,
        PREVIEW_DEDUPE_RUNTIME_DIR: '.lab/internal/runtime',
        PREVIEW_DEDUPE_WINDOWS_SETTLE_MS: '0',
        ...env
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

describe('preview-dedupe waiting requests', () => {
  it('stays alive through the validation window and then runs preview', async () => {
    const repoRoot = await createRepo();
    try {
      const env = {
        PREVIEW_DEDUPE_WINDOWS_COOLDOWN_MS: '3000',
        PREVIEW_DEDUPE_WINDOWS_WINDOW_MS: '3000',
        PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND:
          'echo "[windows-restart-client] status: RUNNING trust=OK responding=True"'
      };
      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 2;\n', 'utf8');
      const first = await runDedupe(repoRoot, 'first', env);
      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 3;\n', 'utf8');
      const second = runDedupe(repoRoot, 'second', env);
      const earlyResult = await Promise.race([second.then(() => 'settled'), delay(120).then(() => 'waiting')]);
      const secondResult = await second;

      expect(first.code).toBe(0);
      expect(earlyResult).toBe('waiting');
      expect(secondResult.code).toBe(0);
      expect(secondResult.stdout).toContain('[windows-preview] request: accepted');
      expect(secondResult.stdout).not.toContain('[windows-preview] request: waiting');
      expect(secondResult.stdout).toContain('[windows-preview] status: STARTED');
      expect(await readFile(path.join(repoRoot, 'runs.log'), 'utf8')).toBe('first\nsecond\n');
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  }, 10_000);

  it('does not run another preview for the same hash after the validation window', async () => {
    const repoRoot = await createRepo();
    try {
      const env = {
        PREVIEW_DEDUPE_WINDOWS_COOLDOWN_MS: '800',
        PREVIEW_DEDUPE_WINDOWS_WINDOW_MS: '800',
        PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND:
          'echo "[windows-restart-client] status: RUNNING trust=OK responding=True"'
      };
      await writeFile(path.join(repoRoot, 'src', 'app', 'App.tsx'), 'export const app = 2;\n', 'utf8');
      const first = await runDedupe(repoRoot, 'first', env);
      const second = runDedupe(repoRoot, 'second', env);
      const earlyResult = await Promise.race([second.then(() => 'settled'), delay(80).then(() => 'waiting')]);
      const secondResult = await second;

      expect(first.code).toBe(0);
      expect(earlyResult).toBe('waiting');
      expect(secondResult.code).toBe(0);
      expect(secondResult.stdout).toContain('[windows-preview] dedupe: covered hash=');
      expect(await readFile(path.join(repoRoot, 'runs.log'), 'utf8')).toBe('first\n');
      const eventLog = await readFile(path.join(repoRoot, '.lab', 'internal', 'runtime', 'windows-preview.events.jsonl'), 'utf8');
      expect(eventLog).toContain('"event":"request-waiting"');
      expect(eventLog).toContain('"reason":"validation-window"');
      expect(eventLog).toContain('"event":"real-preview-skipped"');
    } finally {
      await rm(repoRoot, { force: true, recursive: true });
    }
  }, 10_000);
});
