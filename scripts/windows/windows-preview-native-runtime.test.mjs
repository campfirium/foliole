/* global process */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createNpmCommand, resolveChangedFiles, resolveCommittedFilesSince, runCapture } from './windows-preview-native-runtime.mjs';

it('runs npm through npm-cli.js on Windows without a shell', () => {
  expect(createNpmCommand(['ls'], {}, 'win32', 'C:\\Tools\\nodejs\\node.exe')).toEqual({
    args: ['C:\\Tools\\nodejs\\node_modules\\npm\\bin\\npm-cli.js', 'ls'],
    command: 'C:\\Tools\\nodejs\\node.exe'
  });
});

it('uses npm directly on non-Windows platforms without npm_execpath', () => {
  expect(createNpmCommand(['ls'], {}, 'linux', '/usr/bin/node')).toEqual({
    args: ['ls'],
    command: 'npm'
  });
});

it('prefers npm_execpath when running inside an npm script', () => {
  expect(createNpmCommand(['run', 'check'], { npm_execpath: '/npm/cli.js' }, 'win32', 'C:\\node.exe')).toEqual({
    args: ['/npm/cli.js', 'run', 'check'],
    command: 'C:\\node.exe'
  });
});

it('resolves files committed since a runtime head', async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-preview-runtime-'));
  try {
    await runCapture('git', ['init'], { cwd: repoRoot });
    await runCapture('git', ['config', 'user.email', 'test@example.invalid'], { cwd: repoRoot });
    await runCapture('git', ['config', 'user.name', 'Test'], { cwd: repoRoot });
    await writeFile(path.join(repoRoot, 'a.txt'), 'one', 'utf8');
    await runCapture('git', ['add', 'a.txt'], { cwd: repoRoot });
    await runCapture('git', ['commit', '-m', 'one'], { cwd: repoRoot });
    const fromHead = (await runCapture('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })).stdout.trim();
    await writeFile(path.join(repoRoot, 'b.txt'), 'two', 'utf8');
    await runCapture('git', ['add', 'b.txt'], { cwd: repoRoot });
    await runCapture('git', ['commit', '-m', 'two'], { cwd: repoRoot });
    const toHead = (await runCapture('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })).stdout.trim();

    await expect(resolveCommittedFilesSince(repoRoot, fromHead, toHead)).resolves.toEqual(['b.txt']);
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

it('limits changed files to selected target paths', async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-preview-runtime-'));
  try {
    await runCapture('git', ['init'], { cwd: repoRoot });
    await runCapture('git', ['config', 'user.email', 'test@example.invalid'], { cwd: repoRoot });
    await runCapture('git', ['config', 'user.name', 'Test'], { cwd: repoRoot });
    await mkdir(path.join(repoRoot, 'src/app'), { recursive: true });
    await mkdir(path.join(repoRoot, 'android'), { recursive: true });
    await writeFile(path.join(repoRoot, 'src/app/App.tsx'), 'export const app = true;\n', 'utf8');
    await writeFile(path.join(repoRoot, 'android/tracked.txt'), 'tracked\n', 'utf8');
    await runCapture('git', ['add', 'src/app/App.tsx', 'android/tracked.txt'], { cwd: repoRoot });
    await runCapture('git', ['commit', '-m', 'initial'], { cwd: repoRoot });

    await writeFile(path.join(repoRoot, 'src/app/App.tsx'), 'export const app = false;\n', 'utf8');
    await writeFile(path.join(repoRoot, 'android/tracked.txt'), 'changed\n', 'utf8');
    await writeFile(path.join(repoRoot, 'android/new.txt'), 'new\n', 'utf8');

    await expect(resolveChangedFiles(repoRoot, ['src/app/'])).resolves.toEqual(['src/app/App.tsx']);
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

it('includes staged and unstaged deletions only when requested by quality routing', async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'foliole-preview-runtime-'));
  try {
    await runCapture('git', ['init'], { cwd: repoRoot });
    await runCapture('git', ['config', 'user.email', 'test@example.invalid'], { cwd: repoRoot });
    await runCapture('git', ['config', 'user.name', 'Test'], { cwd: repoRoot });
    await writeFile(path.join(repoRoot, 'staged.ts'), 'export {}\n', 'utf8');
    await writeFile(path.join(repoRoot, 'unstaged.ts'), 'export {}\n', 'utf8');
    await runCapture('git', ['add', '.'], { cwd: repoRoot });
    await runCapture('git', ['commit', '-m', 'initial'], { cwd: repoRoot });
    await rm(path.join(repoRoot, 'staged.ts'));
    await runCapture('git', ['add', 'staged.ts'], { cwd: repoRoot });
    await rm(path.join(repoRoot, 'unstaged.ts'));

    await expect(resolveChangedFiles(repoRoot)).resolves.toEqual([]);
    await expect(resolveChangedFiles(repoRoot, ['.'], { includeDeletes: true }))
      .resolves.toEqual(['staged.ts', 'unstaged.ts']);
  } finally {
    await rm(repoRoot, { force: true, recursive: true });
  }
});

it('times out captured commands so preview control cannot hang forever', async () => {
  const result = await runCapture(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
    timeoutMs: 50
  });

  expect(result.code).toBe(1);
  expect(result.error?.message).toContain('timed out after 50ms');
});
