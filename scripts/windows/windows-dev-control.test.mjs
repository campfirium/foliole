// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';

import {
  parseWindowsDevControlArgs, parseWindowsDevLiveEvidence, runWindowsDevControl,
  windowsDevPushSpec, windowsDevScpSpec, windowsDevSshSpec
} from './windows-dev-control.mjs';

it('accepts only fixed actions with an explicit LAN host', () => {
  expect(parseWindowsDevControlArgs(['--host', 'v\\dev@192.168.0.11', 'build'], {}))
    .toEqual({ action: 'build', host: 'v\\dev@192.168.0.11' });
  expect(parseWindowsDevControlArgs(['--host', 'v\\dev@192.168.0.11', 'deploy'], {}))
    .toMatchObject({ action: 'deploy' });
  expect(parseWindowsDevControlArgs(['--host', 'v\\dev@192.168.0.11', 'live'], {}))
    .toMatchObject({ action: 'live' });
  expect(() => parseWindowsDevControlArgs(['--host', 'v\\dev@192.168.0.11', 'push'], {}))
    .toThrow('only accepts build, deploy, live, or verify');
  expect(() => parseWindowsDevControlArgs([
    '--host', 'v\\dev@192.168.0.11', 'verify', '--commit', 'a'.repeat(40)
  ], {})).toThrow('only accepts build, deploy, live, or verify');
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

it('copies only fixed live evidence with the ordinary SSH identity', () => {
  const remotePath = 'C:/dev/foliole-android-lab-preview/.tmp/artifacts/windows-dev-action/dev-1/a5-live.png';
  const spec = windowsDevScpSpec('v\\dev@192.168.0.11', remotePath, '/repo/a5.png', {}, '/Users/dev');
  expect(spec).toContain('/Users/dev/.ssh/agent/foliole-windows-android-lab');
  expect(spec.at(-2)).toBe(`v\\dev@192.168.0.11:${remotePath}`);
  expect(spec.at(-1)).toBe('/repo/a5.png');
  expect(parseWindowsDevLiveEvidence(
    `[windows-dev-action] live identity=dev-1 screenshot=${remotePath}\n`
  )).toEqual({ buildIdentity: 'dev-1', remotePath });
  expect(() => parseWindowsDevLiveEvidence(
    '[windows-dev-action] live identity=dev-1 screenshot=C:/Users/dev/private.png\n'
  )).toThrow('escaped its fixed evidence root');
});

it('copies live screenshot evidence after the fixed foreground action', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-dev-control-'));
  const remotePath = 'C:/dev/foliole-android-lab-preview/.tmp/artifacts/windows-dev-action/dev-2/a5-live.png';
  const executeScp = vi.fn(async (args) => { fs.writeFileSync(args.at(-1), 'png'); return ''; });
  const result = await runWindowsDevControl({
    argv: ['--host', 'v\\dev@192.168.0.11', 'live'], env: {}, executeGit: vi.fn(async () => ''),
    executeScp, executeSsh: vi.fn(async () =>
      `[windows-dev-action] live identity=dev-2 screenshot=${remotePath}\n`),
    repoRoot, stdout: { write: vi.fn() }
  });
  expect(result).toMatchObject({ action: 'live', screenshotPath: expect.stringContaining('dev-2.png') });
  expect(executeScp).toHaveBeenCalledOnce();
  fs.rmSync(repoRoot, { force: true, recursive: true });
});

it('surfaces remote output before rejecting missing live evidence', async () => {
  const stdout = { write: vi.fn() };
  await expect(runWindowsDevControl({
    argv: ['--host', 'v\\dev@192.168.0.11', 'live'], env: {}, executeGit: vi.fn(async () => ''),
    executeSsh: vi.fn(async () => '[windows-dev-action] status: OK\n'), stdout
  })).rejects.toThrow('did not report screenshot evidence');
  expect(stdout.write).toHaveBeenCalledWith('[windows-dev-action] status: OK\n');
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
