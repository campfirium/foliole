// @vitest-environment node

import { Buffer } from 'node:buffer';
import { expect, it } from 'vitest';

import { runWindowsAndroidLabControl } from './windows-android-lab-control.mjs';

it('force-updates the fixed LAN ref to the latest committed dev HEAD', async () => {
  const head = 'a'.repeat(40);
  const calls = [];
  const executeGit = async (args) => {
    calls.push(args);
    if (args.join(' ') === 'branch --show-current') return Buffer.from('dev\n');
    if (args.join(' ') === 'rev-parse --verify HEAD') return Buffer.from(`${head}\n`);
    if (args[0] === 'push') return Buffer.from('ok\n');
    throw new Error(`unexpected git call: ${args.join(' ')}`);
  };

  await runWindowsAndroidLabControl({
    argv: ['--host', 'tester@windows-host', 'push'], env: {}, executeGit, stdout: { write: () => {} }
  });

  expect(calls).toEqual([
    ['branch', '--show-current'],
    ['rev-parse', '--verify', 'HEAD'],
    [
      'push', '--porcelain', 'tester@windows-host:foliole-android-lab.git',
      `${head}:refs/heads/lab/dev`
    ]
  ]);
});

it('does not include uncommitted working-tree content in the LAN update', async () => {
  const calls = [];
  await runWindowsAndroidLabControl({
    argv: ['--host', 'tester@windows-host', 'push'], env: {}, executeGit: async (args) => {
      calls.push(args);
      if (args[0] === 'branch') return Buffer.from('dev\n');
      if (args[0] === 'rev-parse') return Buffer.from(`${'b'.repeat(40)}\n`);
      return Buffer.from('ok\n');
    }, stdout: { write: () => {} }
  });
  expect(calls.some((args) => args[0] === 'status' || args[0] === 'commit-tree')).toBe(false);
});

it('rejects arbitrary commit and legacy repair arguments before Git runs', async () => {
  for (const argv of [
    ['--host', 'tester@windows-host', 'push', '--commit', 'a'.repeat(40)],
    ['--host', 'tester@windows-host', 'repair', '--commit', 'a'.repeat(40)]
  ]) {
    await expect(runWindowsAndroidLabControl({
      argv, env: {}, executeGit: async () => { throw new Error('git must not run'); }, stdout: { write: () => {} }
    })).rejects.toThrow();
  }
});
