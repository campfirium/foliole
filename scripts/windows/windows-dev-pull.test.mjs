// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { runWindowsDevPull } from './windows-dev-pull.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-dev-pull-'));
  roots.push(repoRoot);
  const gitPath = path.join(repoRoot, 'git.exe');
  fs.writeFileSync(gitPath, 'tool');
  return { gitPath, repoRoot };
}

function result(stdout, code = 0) {
  return { code, lines: stdout ? [stdout] : [], output: stdout, stderr: code ? stdout : '', stdout };
}

it('overwrites Windows source drift with the Mac-owned lan/dev mirror', async () => {
  const paths = fixture();
  const calls = [];
  const execute = vi.fn(async (_command, args) => {
    calls.push(args);
    if (args.includes('--show-toplevel')) return result(paths.repoRoot);
    if (args.includes('--show-current')) return result('dev');
    if (args.includes('status')) return result('');
    if (args.includes('clean')) return result('Removing local-only.ts\n');
    return result('Already up to date.\n');
  });
  await expect(runWindowsDevPull({ execute, paths, platform: 'win32' }))
    .resolves.toMatchObject({ exitCode: 0 });
  expect(calls.slice(-4)).toEqual([
    ['-C', paths.repoRoot, 'fetch', '--no-tags', 'lan', 'dev'],
    ['-C', paths.repoRoot, 'reset', '--hard', 'FETCH_HEAD'],
    ['-C', paths.repoRoot, 'clean', '-fd'],
    ['-C', paths.repoRoot, 'status', '--porcelain', '--untracked-files=all']
  ]);
});

it('does not overwrite Windows drift when mirror fetch fails', async () => {
  const paths = fixture();
  const calls = [];
  const execute = vi.fn(async (_command, args) => {
    calls.push(args);
    if (args.includes('--show-toplevel')) return result(paths.repoRoot);
    if (args.includes('--show-current')) return result('dev');
    if (args.includes('fetch')) return result('fetch blocked', 1);
    return result('');
  });
  await expect(runWindowsDevPull({ execute, paths, platform: 'win32' }))
    .resolves.toMatchObject({ exitCode: 64, stage: 'fetch' });
  expect(calls.some((args) => args.includes('reset'))).toBe(false);
  expect(calls.some((args) => args.includes('clean'))).toBe(false);
});

it('fails when reset and clean do not converge the fixed checkout', async () => {
  const paths = fixture();
  const calls = [];
  const execute = vi.fn(async (_command, args) => {
    calls.push(args);
    if (args.includes('--show-toplevel')) return result(paths.repoRoot);
    if (args.includes('--show-current')) return result('dev');
    if (args.includes('status')) return result('?? nested-repository/');
    return result('');
  });
  await expect(runWindowsDevPull({ execute, paths, platform: 'win32' }))
    .resolves.toMatchObject({ exitCode: 64, stage: 'align' });
  expect(calls.some((args) => args.includes('reset'))).toBe(true);
  expect(calls.some((args) => args.includes('clean'))).toBe(true);
});
