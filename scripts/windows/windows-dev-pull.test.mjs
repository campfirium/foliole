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

it('validates the fixed dev checkout and pulls only lan/dev before the action runner', async () => {
  const paths = fixture();
  const calls = [];
  const execute = vi.fn(async (_command, args) => {
    calls.push(args);
    if (args.includes('--show-toplevel')) return result(paths.repoRoot);
    if (args.includes('--show-current')) return result('dev');
    return result('Already up to date.');
  });
  await expect(runWindowsDevPull({ execute, paths, platform: 'win32' }))
    .resolves.toMatchObject({ exitCode: 0 });
  expect(calls.at(-1)).toEqual(['-C', paths.repoRoot, 'pull', '--ff-only', 'lan', 'dev']);
});

it('fails closed without starting an action when fast-forward pull is blocked', async () => {
  const paths = fixture();
  const execute = vi.fn(async (_command, args) => {
    if (args.includes('--show-toplevel')) return result(paths.repoRoot);
    if (args.includes('--show-current')) return result('dev');
    return result('pull blocked', 1);
  });
  await expect(runWindowsDevPull({ execute, paths, platform: 'win32' }))
    .resolves.toMatchObject({ exitCode: 64, stage: 'pull' });
});
