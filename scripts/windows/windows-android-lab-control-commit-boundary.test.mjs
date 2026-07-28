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
  })).rejects.toThrow('repair --commit <formal SHA> --expected-current <current Lab SHA>');
  const pushArgs = calls.at(-1);
  expect(pushArgs).toEqual([
    'push', '--porcelain', 'tester@windows-host:foliole-android-lab.git', `${head}:refs/heads/lab/dev`
  ]);
  expect(pushArgs.join(' ')).not.toMatch(/force|^\+/u);
});

it('repairs through the fixed local CAS action then queues the existing run entry', async () => {
  const formal = 'a'.repeat(40);
  const legacy = 'd'.repeat(40);
  const gitCalls = [];
  const sshCalls = [];
  const executeGit = async (args) => {
    gitCalls.push(args);
    if (args.join(' ') === `rev-parse --verify ${formal}^{commit}`) return Buffer.from(`${formal}\n`);
    if (args.join(' ') === 'rev-parse --verify refs/remotes/origin/dev^{commit}') return Buffer.from(`${formal}\n`);
    if (args.join(' ') === `merge-base --is-ancestor ${formal} refs/remotes/origin/dev`) return Buffer.from('');
    throw new Error(`unexpected git call: ${args.join(' ')}`);
  };
  let output = '';

  await runWindowsAndroidLabControl({
    argv: [
      '--host', 'tester@windows-host', 'repair', '--commit', formal, '--expected-current', legacy
    ], env: {}, executeGit, executeSsh: async (_host, command) => {
      sshCalls.push(command);
      return Buffer.from(command[0] === 'maintenance'
        ? JSON.stringify({ commitSha: formal, status: 'updated' })
        : JSON.stringify({ commitSha: formal, state: 'pending' }));
    },
    stdout: { write: (value) => { output += String(value); } }
  });

  expect(gitCalls).toEqual([
    ['rev-parse', '--verify', `${formal}^{commit}`],
    ['rev-parse', '--verify', 'refs/remotes/origin/dev^{commit}'],
    ['merge-base', '--is-ancestor', formal, 'refs/remotes/origin/dev']
  ]);
  expect(sshCalls).toEqual([
    ['maintenance', 'repair-ref', formal, legacy], ['run', formal]
  ]);
  expect(JSON.parse(output)).toMatchObject({ commitSha: formal, operation: 'repair', sourceKind: 'formal' });
});

it('rejects a target outside the fixed formal dev ref before contacting Windows', async () => {
  const formal = 'a'.repeat(40);
  const sshCalls = [];
  await expect(runWindowsAndroidLabControl({
    argv: [
      '--host', 'tester@windows-host', 'repair', '--commit', formal,
      '--expected-current', 'd'.repeat(40)
    ], env: {}, executeGit: async (args) => {
      if (args.join(' ') === `rev-parse --verify ${formal}^{commit}`) return Buffer.from(`${formal}\n`);
      if (args.join(' ') === 'rev-parse --verify refs/remotes/origin/dev^{commit}') return Buffer.from(`${'b'.repeat(40)}\n`);
      throw new Error('not an ancestor of formal dev');
    }, executeSsh: async (...args) => { sshCalls.push(args); return Buffer.from('{}'); },
    stdout: { write: () => {} }
  })).rejects.toThrow('not an ancestor of formal dev');
  expect(sshCalls).toEqual([]);
});

it('rejects repair without both immutable commit identities before Git runs', async () => {
  await expect(runWindowsAndroidLabControl({
    argv: ['--host', 'tester@windows-host', 'repair', '--commit', 'a'.repeat(40)], env: {},
    executeGit: async () => { throw new Error('git must not run'); }, stdout: { write: () => {} }
  })).rejects.toThrow('repair requires --commit');
});
