// @vitest-environment node
/* global process */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW_DEDUPE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'preview-dedupe.mjs');

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? REPO_ROOT,
      env: options.env ?? process.env,
      shell: false
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('close', (code) => {
      resolve({ code, stderr, stdout });
    });
  });
}

async function setupRepo() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'preview-dedupe-target-'));
  await run('git', ['init'], { cwd: repoRoot });
  await run('git', ['config', 'user.email', 'test@example.invalid'], { cwd: repoRoot });
  await run('git', ['config', 'user.name', 'Test'], { cwd: repoRoot });
  await mkdir(path.join(repoRoot, 'src/app'), { recursive: true });
  await writeFile(path.join(repoRoot, '.gitignore'), '.lab/\nruns.log\n', 'utf8');
  await writeFile(path.join(repoRoot, 'src/app/App.tsx'), 'export const app = true;\n', 'utf8');
  await run('git', ['add', '.gitignore', 'src/app/App.tsx'], { cwd: repoRoot });
  await run('git', ['commit', '-m', 'initial'], { cwd: repoRoot });
  return repoRoot;
}

function previewEnv(repoRoot) {
  return {
    ...process.env,
    PREVIEW_DEDUPE_REPO_ROOT: repoRoot,
    PREVIEW_DEDUPE_RUNTIME_DIR: '.lab/internal/runtime',
    PREVIEW_DEDUPE_WINDOWS_SETTLE_MS: '0',
    PREVIEW_DEDUPE_WINDOWS_STATUS_COMMAND: 'echo "[windows-restart-client] status: RUNNING trust=OK responding=True"',
    PREVIEW_DEDUPE_WINDOWS_WINDOW_MS: '0'
  };
}

it('ignores untracked files outside the selected preview target', async () => {
  const repoRoot = await setupRepo();
  try {
    const first = await run(process.execPath, [
      PREVIEW_DEDUPE_SCRIPT,
      'windows',
      '--',
      'bash',
      '-lc',
      'echo first >> runs.log'
    ], { env: previewEnv(repoRoot) });
    expect(first.code).toBe(0);
    const hashPath = path.join(repoRoot, '.lab/internal/runtime/windows-preview.hash');
    const storedHash = await readFile(hashPath, 'utf8');

    await mkdir(path.join(repoRoot, 'android/app/src/main/res'), { recursive: true });
    await writeFile(path.join(repoRoot, 'android/app/src/main/res/splash.png'), 'android-only\n', 'utf8');

    const second = await run(process.execPath, [
      PREVIEW_DEDUPE_SCRIPT,
      'windows',
      '--',
      'bash',
      '-lc',
      'echo second >> runs.log'
    ], { env: previewEnv(repoRoot) });

    expect(second.code).toBe(0);
    expect(second.stdout).toContain('[windows-preview] dedupe: covered hash=');
    await expect(readFile(hashPath, 'utf8')).resolves.toBe(storedHash);
    await expect(readFile(path.join(repoRoot, 'runs.log'), 'utf8')).resolves.toBe('first\n');
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
}, 15_000);
