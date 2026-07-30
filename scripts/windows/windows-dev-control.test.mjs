// @vitest-environment node

import fs from 'node:fs';
import { expect, it, vi } from 'vitest';

import {
  parseWindowsDevControlArgs, runWindowsDevControl, windowsDevPushSpec, windowsDevSshSpec
} from './windows-dev-control.mjs';

it('accepts only fixed actions with an explicit LAN host', () => {
  expect(parseWindowsDevControlArgs(['--host', 'v\\dev@192.168.0.11', 'build'], {}))
    .toEqual({ action: 'build', host: 'v\\dev@192.168.0.11' });
  expect(parseWindowsDevControlArgs(['--host', 'v\\dev@192.168.0.11', 'deploy'], {}))
    .toMatchObject({ action: 'deploy' });
  expect(() => parseWindowsDevControlArgs(['--host', 'v\\dev@192.168.0.11', 'push'], {}))
    .toThrow('only accepts build, deploy, or verify');
  expect(() => parseWindowsDevControlArgs([
    '--host', 'v\\dev@192.168.0.11', 'verify', '--commit', 'a'.repeat(40)
  ], {})).toThrow('only accepts build, deploy, or verify');
});

it('pushes dev and then invokes the fixed Windows action', async () => {
  const calls = [];
  const executeGit = vi.fn(async (args) => { calls.push(['git', ...args]); return ''; });
  const executeSsh = vi.fn(async (args) => { calls.push(['ssh', ...args]); return 'remote ok\n'; });
  const stdout = { write: vi.fn() };
  await expect(runWindowsDevControl({
    argv: ['--host', 'v\\dev@192.168.0.11', 'verify'], env: {}, executeGit, executeSsh, stdout
  })).resolves.toMatchObject({ action: 'verify', ref: 'refs/heads/dev' });
  expect(calls[0]).toEqual([
    'git', 'push', '--porcelain', 'v\\dev@192.168.0.11:foliole-dev.git', 'dev:refs/heads/dev'
  ]);
  expect(calls[1][0]).toBe('ssh');
  expect(calls[1]).toContain('verify');
  expect(calls.flat()).not.toContain('rev-parse');
  expect(stdout.write).toHaveBeenCalledWith('remote ok\n');
});

it('uses only the dedicated Git key and strict host checking', () => {
  const spec = windowsDevPushSpec('v\\dev@192.168.0.11', {}, '/Users/dev');
  expect(spec.env.GIT_SSH_COMMAND).toContain('foliole-windows-android-lab-git');
  expect(spec.env.GIT_SSH_COMMAND).toContain('StrictHostKeyChecking=yes');
});

it('uses only the ordinary SSH key and fixed remote action path', () => {
  const spec = windowsDevSshSpec('v\\dev@192.168.0.11', 'deploy', {}, '/Users/dev');
  expect(spec).toContain('/Users/dev/.ssh/agent/foliole-windows-android-lab');
  expect(spec).toContain('C:/dev/foliole-android-lab-preview/scripts/windows/windows-dev-action.ps1');
  expect(spec.at(-1)).toBe('deploy');
});

it('does not resolve or compare commit identifiers', () => {
  const source = fs.readFileSync('scripts/windows/windows-dev-control.mjs', 'utf8');
  expect(source).not.toMatch(/rev-parse|show-current|commitSha|COMMIT_SHA/u);
});

it('does not enter SSH when the ordinary dev push fails', async () => {
  const executeSsh = vi.fn();
  await expect(runWindowsDevControl({
    argv: ['--host', 'v\\dev@192.168.0.11', 'build'], env: {},
    executeGit: vi.fn(async () => { throw new Error('push failed'); }), executeSsh
  })).rejects.toThrow('push failed');
  expect(executeSsh).not.toHaveBeenCalled();
});
