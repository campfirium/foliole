// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { updateWindowsAndroidLabRepository } from './windows-android-lab-git-sync.mjs';
import { androidLabPaths } from './windows-android-lab-state.mjs';

const roots = [];
const SHA = 'a'.repeat(40);
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-git-sync-'));
  roots.push(root);
  const paths = androidLabPaths(root);
  paths.checkout = path.join(root, 'project');
  return { config: { gitPath: 'git.exe' }, paths };
}

describe('Windows Android Lab Git sync', () => {
  it('clones a missing repository, then verifies the requested commit', async () => {
    const { config, paths } = fixture();
    const calls = [];
    const executeCommand = async (_command, args, options) => {
      calls.push({ args, options });
      if (args.includes('clone')) fs.mkdirSync(path.join(paths.checkout, '.git'), { recursive: true });
      return { code: 0, lines: [], output: args.includes('rev-parse') ? `${SHA}\n` : '' };
    };
    await expect(updateWindowsAndroidLabRepository(config, paths, SHA, executeCommand)).resolves.toEqual({ commitSha: SHA });
    expect(calls.some(({ args }) => args.includes('clone') && args.includes('lan') && args.includes('lab/dev'))).toBe(true);
    expect(calls.some(({ args }) => args.includes('pull'))).toBe(true);
  });

  it('uses only a fast-forward pull for an existing repository', async () => {
    const { config, paths } = fixture();
    fs.mkdirSync(path.join(paths.checkout, '.git'), { recursive: true });
    const calls = [];
    const executeCommand = async (_command, args) => {
      calls.push(args);
      return { code: 0, lines: [], output: args.includes('rev-parse') ? `${SHA}\n` : '' };
    };
    await updateWindowsAndroidLabRepository(config, paths, SHA, executeCommand);
    expect(calls.some((args) => args.includes('clone'))).toBe(false);
    expect(calls.find((args) => args.includes('pull'))).toEqual(expect.arrayContaining(['pull', '--ff-only', 'lan', 'lab/dev']));
  });

  it('reports Git failure without resetting or rebuilding the repository', async () => {
    const { config, paths } = fixture();
    fs.mkdirSync(path.join(paths.checkout, '.git'), { recursive: true });
    const executeCommand = async (_command, args) => ({
      code: args.includes('pull') ? 1 : 0, lines: ['local changes block pull'], output: ''
    });
    await expect(updateWindowsAndroidLabRepository(config, paths, SHA, executeCommand)).rejects.toMatchObject({
      code: 'lab_git_pull_failed'
    });
    expect(fs.existsSync(path.join(paths.checkout, '.git'))).toBe(true);
  });
});
