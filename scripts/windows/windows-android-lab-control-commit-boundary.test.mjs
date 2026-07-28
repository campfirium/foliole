// @vitest-environment node

import { Buffer } from 'node:buffer';
import { expect, it } from 'vitest';

import { runWindowsAndroidLabControl } from './windows-android-lab-control.mjs';

it('fails closed instead of turning a dirty working tree into a Lab scratch commit', async () => {
  const head = 'a'.repeat(40);
  const calls = [];
  const executeGit = async (args) => {
    calls.push(args);
    if (args.join(' ') === 'branch --show-current') return Buffer.from('dev\n');
    if (args.join(' ') === 'rev-parse --verify HEAD') return Buffer.from(`${head}\n`);
    if (args.join(' ') === 'status --porcelain') return Buffer.from(' M scripts/windows/probe.mjs\n');
    throw new Error(`unexpected git call: ${args.join(' ')}`);
  };

  await expect(runWindowsAndroidLabControl({
    argv: ['--host', 'tester@windows-host', 'push'], env: {}, executeGit, stdout: { write: () => {} }
  })).rejects.toThrow('commit the intended Lab input first');

  expect(calls.map((args) => args[0])).toEqual(['branch', 'rev-parse', 'status']);
  expect(calls.some((args) => args[0] === 'commit-tree' || args[0] === 'push')).toBe(false);
});

it('rejects the former scratch continuation option at the controller boundary', async () => {
  await expect(runWindowsAndroidLabControl({
    argv: ['--host', 'tester@windows-host', 'push', '--scratch-base', 'd'.repeat(40)], env: {},
    executeGit: async () => { throw new Error('git must not run for an unsupported option'); },
    stdout: { write: () => {} }
  })).rejects.toThrow('push accepts no arguments, or --commit');
});
