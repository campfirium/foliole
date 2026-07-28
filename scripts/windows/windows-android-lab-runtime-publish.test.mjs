// @vitest-environment node

import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';

import { runWindowsAndroidLabControl } from './windows-android-lab-control.mjs';

describe('Windows Android Lab runtime bootstrap', () => {
  it('bootstraps v5 through an exact-tree carrier and repairs back to the formal commit', async () => {
    const formal = 'a'.repeat(40);
    const legacy = 'd'.repeat(40);
    const tree = 'b'.repeat(40);
    const carrier = 'c'.repeat(40);
    const gitCalls = [];
    const sshCalls = [];
    const executeGit = async (args) => {
      gitCalls.push(args);
      if (args.join(' ') === 'branch --show-current') return Buffer.from('dev\n');
      if (args.join(' ') === `rev-parse --verify ${formal}^{commit}`) return Buffer.from(`${formal}\n`);
      if (args.join(' ') === `rev-parse --verify ${legacy}^{commit}`) return Buffer.from(`${legacy}\n`);
      if (args.join(' ') === `merge-base --is-ancestor ${formal} HEAD`) return Buffer.from('');
      if (args.join(' ') === `rev-parse --verify ${formal}^{tree}`) return Buffer.from(`${tree}\n`);
      if (args[0] === 'commit-tree') return Buffer.from(`${carrier}\n`);
      if (args.join(' ') === `rev-parse --verify ${formal}:scripts/windows`) return Buffer.from(`${tree}\n`);
      if (args[0] === 'push') return Buffer.from('ok\n');
      throw new Error(`unexpected Git call: ${args.join(' ')}`);
    };
    const executeSsh = async (_host, command) => {
      sshCalls.push(command);
      if (command[0] === 'status') {
        const protocolVersion = sshCalls.filter((call) => call[0] === 'status').length === 1 ? 5 : 7;
        return Buffer.from(JSON.stringify({ protocolVersion }));
      }
      const commitSha = command[2];
      return Buffer.from(JSON.stringify({ commitSha, status: 'updated' }));
    };
    let output = '';

    await runWindowsAndroidLabControl({
      argv: [
        '--host', 'tester@windows-host', 'runtime', 'bootstrap', '--commit', formal,
        '--expected-current', legacy
      ], env: {}, executeGit, executeSsh, stdout: { write: (value) => { output += String(value); } }
    });

    expect(gitCalls.find((args) => args[0] === 'commit-tree')).toEqual([
      'commit-tree', tree, '-p', legacy, '-m', `Windows Android Lab runtime bootstrap ${formal}`
    ]);
    expect(gitCalls.some((args) => ['add', 'read-tree', 'write-tree'].includes(args[0]))).toBe(false);
    expect(gitCalls.filter((args) => args[0] === 'push')).toEqual([
      [
        'push', '--porcelain', `--force-with-lease=refs/heads/lab/dev:${legacy}`,
        'tester@windows-host:foliole-android-lab.git', `${carrier}:refs/heads/lab/dev`
      ],
      [
        'push', '--porcelain', 'tester@windows-host:foliole-android-lab-runtime.git',
        `${formal}:refs/heads/lab/runtime`
      ],
      [
        'push', '--porcelain', `--force-with-lease=refs/heads/lab/dev:${carrier}`,
        'tester@windows-host:foliole-android-lab-repair.git', `+${formal}:refs/heads/lab/dev`
      ]
    ]);
    expect(sshCalls).toEqual([
      ['status'], ['runtime', 'update', carrier], ['status'], ['runtime', 'update', formal, tree]
    ]);
    expect(JSON.parse(output)).toMatchObject({ carrierSha: carrier, commitSha: formal, fromProtocol: 5 });
  });

  it('rejects an arbitrary or incomplete bootstrap command before Git runs', async () => {
    await expect(runWindowsAndroidLabControl({
      argv: ['--host', 'tester@windows-host', 'runtime', 'bootstrap', '--path', 'C:\\Windows'], env: {},
      executeGit: async () => { throw new Error('Git must not run'); }, stdout: { write: () => {} }
    })).rejects.toThrow('requires --commit');
  });

  it('keeps normal runtime update fail-closed and points legacy protocol to bootstrap', async () => {
    await expect(runWindowsAndroidLabControl({
      argv: ['--host', 'tester@windows-host', 'runtime', 'update', 'a'.repeat(40)], env: {},
      executeGit: async () => { throw new Error('Git must not run'); },
      executeSsh: async () => Buffer.from('{"protocolVersion":5}'), stdout: { write: () => {} }
    })).rejects.toThrow('runtime bootstrap --commit <formal SHA>');
  });
});
