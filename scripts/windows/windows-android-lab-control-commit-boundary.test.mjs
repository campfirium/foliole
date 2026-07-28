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

it('keeps ordinary push non-forced and points divergence to explicit repair', async () => {
  const head = 'a'.repeat(40);
  const calls = [];
  const executeGit = async (args) => {
    calls.push(args);
    if (args.join(' ') === 'branch --show-current') return Buffer.from('dev\n');
    if (args.join(' ') === 'rev-parse --verify HEAD') return Buffer.from(`${head}\n`);
    if (args.join(' ') === 'status --porcelain') return Buffer.from('');
    if (args[0] === 'push') throw new Error('! [rejected] non-fast-forward');
    throw new Error(`unexpected git call: ${args.join(' ')}`);
  };

  await expect(runWindowsAndroidLabControl({
    argv: ['--host', 'tester@windows-host', 'push'], env: {}, executeGit, stdout: { write: () => {} }
  })).rejects.toThrow('use the explicit repair action');
  const pushArgs = calls.at(-1);
  expect(pushArgs).toEqual([
    'push', '--porcelain', 'tester@windows-host:foliole-android-lab.git', `${head}:refs/heads/lab/dev`
  ]);
  expect(pushArgs.join(' ')).not.toMatch(/force|^\+/u);
});

it('repairs only the fixed Lab ref with an exact lease and committed HEAD ancestor', async () => {
  const formal = 'a'.repeat(40);
  const legacy = 'd'.repeat(40);
  const calls = [];
  const executeGit = async (args) => {
    calls.push(args);
    if (args.join(' ') === 'branch --show-current') return Buffer.from('dev\n');
    if (args.join(' ') === `rev-parse --verify ${formal}^{commit}`) return Buffer.from(`${formal}\n`);
    if (args.join(' ') === `merge-base --is-ancestor ${formal} HEAD`) return Buffer.from('');
    if (args[0] === 'push') return Buffer.from('ok\n');
    throw new Error(`unexpected git call: ${args.join(' ')}`);
  };
  let output = '';

  await runWindowsAndroidLabControl({
    argv: [
      '--host', 'tester@windows-host', 'repair', '--commit', formal, '--expected-current', legacy
    ], env: {}, executeGit, executeSsh: async () => Buffer.from('{"protocolVersion":6}'),
    stdout: { write: (value) => { output += String(value); } }
  });

  expect(calls.map((args) => args[0])).toEqual(['branch', 'rev-parse', 'merge-base', 'push']);
  expect(calls.at(-1)).toEqual([
    'push', '--porcelain', `--force-with-lease=refs/heads/lab/dev:${legacy}`,
    'tester@windows-host:foliole-android-lab-repair.git', `+${formal}:refs/heads/lab/dev`
  ]);
  expect(JSON.parse(output)).toMatchObject({ commitSha: formal, operation: 'repair', sourceKind: 'formal' });
});

it('fails repair closed when the installed Lab lacks the repair protocol', async () => {
  await expect(runWindowsAndroidLabControl({
    argv: [
      '--host', 'tester@windows-host', 'repair', '--commit', 'a'.repeat(40),
      '--expected-current', 'd'.repeat(40)
    ], env: {}, executeGit: async () => { throw new Error('git must not run'); },
    executeSsh: async () => Buffer.from('{"protocolVersion":5}'), stdout: { write: () => {} }
  })).rejects.toThrow('version mismatch; reinstall the Lab');
});

it('rejects repair without both immutable commit identities before Git runs', async () => {
  await expect(runWindowsAndroidLabControl({
    argv: ['--host', 'tester@windows-host', 'repair', '--commit', 'a'.repeat(40)], env: {},
    executeGit: async () => { throw new Error('git must not run'); }, stdout: { write: () => {} }
  })).rejects.toThrow('repair requires --commit');
});
