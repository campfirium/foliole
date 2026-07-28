// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { configureAndroidLabGitRepositories } from './windows-android-lab-git-repositories.mjs';
import { androidLabPaths } from './windows-android-lab-state.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

describe('Windows Android Lab fixed Git repositories', () => {
  it('creates only the source and runtime repositories with one fixed ref each', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-android-lab-git-'));
    roots.push(root);
    const paths = androidLabPaths(root);
    const calls = [];
    const run = (_gitPath, args) => {
      calls.push(args);
      if (args[0] === 'init') {
        fs.mkdirSync(args.at(-1), { recursive: true });
        fs.writeFileSync(path.join(args.at(-1), 'HEAD'), 'bare');
      }
    };
    configureAndroidLabGitRepositories({ gitPath: 'git.exe', paths, run });
    expect(calls.filter((args) => args[0] === 'init').map((args) => args.at(-1)))
      .toEqual([paths.repository, paths.runtimeRepository]);
    expect(fs.readFileSync(path.join(paths.repository, 'hooks', 'pre-receive'), 'utf8'))
      .toContain('if [ "$updated_ref" != "refs/heads/lab/dev" ]');
    expect(fs.readFileSync(path.join(paths.runtimeRepository, 'hooks', 'pre-receive'), 'utf8'))
      .toContain('if [ "$updated_ref" != "refs/heads/lab/runtime" ]');
  });
});
