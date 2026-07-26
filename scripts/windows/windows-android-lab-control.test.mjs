// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import {
  androidLabGitPushSpec, androidLabSigningInstallSpec, androidLabSshArgs, parseAndroidLabControlArgs, remoteAndroidLabPaths,
  runWindowsAndroidLabControl
} from './windows-android-lab-control.mjs';

describe('Windows Android lab Mac controller', () => {
  it('uses a second SSH key and Android lab dispatcher', () => {
    const remote = remoteAndroidLabPaths({}, '/Users/tester');
    expect(remote.sshKey).toBe(path.join('/Users/tester', '.ssh', 'agent', 'foliole-windows-android-lab'));
    expect(remote.gitSshKey).toBe(path.join('/Users/tester', '.ssh', 'agent', 'foliole-windows-android-lab-git'));
  });

  it('parses a binary evidence output without changing the remote command', () => {
    expect(parseAndroidLabControlArgs([
      '--host', 'tester@windows-host', '--output', '.tmp/screenshot.png', 'collect', 'get', 'screenshot.png'
    ], {})).toEqual({
      command: ['collect', 'get', 'screenshot.png'], host: 'tester@windows-host', output: '.tmp/screenshot.png'
    });
  });

  it('preflights run-scoped collect and rejects an older installed dispatcher explicitly', async () => {
    await expect(runWindowsAndroidLabControl({
      argv: ['--host', 'tester@windows-host', 'collect', 'list', '1000-aaaaaaaaaaaa'], env: {},
      executeSsh: async () => Buffer.from('{"schemaVersion":1,"state":"idle"}\n'), stdout: { write: () => {} }
    })).rejects.toThrow('version mismatch');
    const calls = [];
    await runWindowsAndroidLabControl({
      argv: ['--host', 'tester@windows-host', 'collect', 'get', '1000-aaaaaaaaaaaa', 'summary.json'], env: {},
      executeSsh: async (_host, command) => {
        calls.push(command);
        return command[0] === 'status' ? Buffer.from('{"protocolVersion":2,"state":"idle"}\n') : Buffer.from('evidence');
      }, stdout: { write: () => {} }
    });
    expect(calls).toEqual([['status'], ['collect', 'get', '1000-aaaaaaaaaaaa', 'summary.json']]);
  });

  it('requires an explicit SSH user and sends only action tokens', () => {
    expect(() => parseAndroidLabControlArgs(['--host', 'windows-host', 'status'], {})).toThrow();
    expect(parseAndroidLabControlArgs(['--host', 'tester@windows-host', 'device', 'status'], {}).command).toEqual(['device', 'status']);
    const args = androidLabSshArgs('tester@windows-host', ['device', 'status'], {}, '/Users/tester');
    expect(args.slice(-3)).toEqual(['tester@windows-host', 'device', 'status']);
    expect(args.join(' ')).not.toMatch(/node\.exe|dispatcher/iu);
  });

  it('pushes only clean dev HEAD to the fixed LAN ref with the dedicated key', async () => {
    const sha = 'e'.repeat(40);
    const calls = [];
    const results = ['', 'dev\n', `${sha}\n`, 'ok\n'];
    const executeGit = async (args, options) => {
      calls.push({ args, options });
      return Buffer.from(results.shift());
    };
    let output = '';
    await runWindowsAndroidLabControl({
      argv: ['--host', 'tester@windows-host', 'push'], env: {}, executeGit,
      stdout: { write: (value) => { output += String(value); } }
    });
    expect(calls.at(-1).args).toEqual([
      'push', '--porcelain', 'tester@windows-host:foliole-android-lab.git', `${sha}:refs/heads/lab/dev`
    ]);
    expect(calls.at(-1).options.env.GIT_SSH_COMMAND).toContain('foliole-windows-android-lab-git');
    expect(JSON.parse(output)).toMatchObject({ commitSha: sha, ref: 'refs/heads/lab/dev' });
  });

  it('builds no GitHub URL or mutable working-tree transfer', () => {
    const spec = androidLabGitPushSpec('tester@windows-host', 'f'.repeat(40), {}, '/Users/tester');
    expect(spec.args.join(' ')).not.toMatch(/github|bundle|patch/iu);
  });

  it('converts a local keystore into a fixed remote command and binary stdin', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'android-lab-signing-'));
    const file = path.join(root, 'debug.keystore');
    fs.writeFileSync(file, 'private signing bytes');
    try {
      const spec = androidLabSigningInstallSpec(file);
      expect(spec.command).toEqual(['signing', 'install', '21', spec.sha256]);
      const calls = [];
      await runWindowsAndroidLabControl({
        argv: ['--host', 'tester@windows-host', 'signing', 'install', file], env: {},
        executeSsh: async (...args) => { calls.push(args); return Buffer.from('{"state":"installed"}\n'); },
        stdout: { write: () => {} }
      });
      expect(calls[0][1]).toEqual(spec.command);
      expect(calls[0][3]).toEqual(Buffer.from('private signing bytes'));
      expect(calls[0][1].join(' ')).not.toContain(file);
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });
});
