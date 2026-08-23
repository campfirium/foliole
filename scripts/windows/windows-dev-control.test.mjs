// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';

import {
  parseWindowsDevCaptureAnnotationEvidence, parseWindowsDevControlArgs,
  parseWindowsDevFailureEvidence, parseWindowsDevLiveEvidence,
  runWindowsDevControl,
  WINDOWS_DEV_DEFAULT_SSH, windowsDevPushSpec, windowsDevScpSpec, windowsDevSshSpec
} from './windows-dev-control.mjs';

const TEST_HOME = '/Users/dev';
const TEST_WINDOWS_DEV_SSH_KEY = path.join(
  TEST_HOME, '.ssh', 'agent', 'foliole-windows-android-lab'
);

it('uses the fixed Windows DEV host and accepts only fixed actions', () => {
  expect(parseWindowsDevControlArgs(['build'], {}))
    .toEqual({ action: 'build', host: WINDOWS_DEV_DEFAULT_SSH });
  expect(parseWindowsDevControlArgs(['--host', WINDOWS_DEV_DEFAULT_SSH, 'deploy'], {}))
    .toMatchObject({ action: 'deploy' });
  expect(parseWindowsDevControlArgs(['--host', WINDOWS_DEV_DEFAULT_SSH, 'live'], {}))
    .toMatchObject({ action: 'live' });
  expect(parseWindowsDevControlArgs(['--host', WINDOWS_DEV_DEFAULT_SSH, 'appearance'], {}))
    .toMatchObject({ action: 'appearance' });
  expect(parseWindowsDevControlArgs(['--host', WINDOWS_DEV_DEFAULT_SSH, 'capture-annotation'], {}))
    .toMatchObject({ action: 'capture-annotation' });
  expect(() => parseWindowsDevControlArgs(['--host', WINDOWS_DEV_DEFAULT_SSH, 'pair-sync-recover'], {}))
    .toThrow('only accepts a registered fixed action');
  expect(parseWindowsDevControlArgs(['--host', WINDOWS_DEV_DEFAULT_SSH, 'multi-device-sync-candidate'], {}))
    .toMatchObject({ action: 'multi-device-sync-candidate' });
  expect(parseWindowsDevControlArgs(['--host', WINDOWS_DEV_DEFAULT_SSH, 'multi-device-sync-a-rejoin'], {}))
    .toMatchObject({ action: 'multi-device-sync-a-rejoin' });
  expect(parseWindowsDevControlArgs(['--host', WINDOWS_DEV_DEFAULT_SSH, 'multi-device-sync-a-leave'], {}))
    .toMatchObject({ action: 'multi-device-sync-a-leave' });
  expect(parseWindowsDevControlArgs(['--host', WINDOWS_DEV_DEFAULT_SSH, 'multi-device-sync-from-zero'], {}))
    .toMatchObject({ action: 'multi-device-sync-from-zero' });
  expect(parseWindowsDevControlArgs(['multi-device-sync-provider-complete'], {}))
    .toMatchObject({ action: 'multi-device-sync-provider-complete' });
  expect(() => parseWindowsDevControlArgs(['sync-group-recover'], {}))
    .toThrow('only accepts a registered fixed action');
  expect(parseWindowsDevControlArgs(['--host', WINDOWS_DEV_DEFAULT_SSH, 'secondary'], {}))
    .toMatchObject({ action: 'secondary' });
  expect(() => parseWindowsDevControlArgs(['--host', WINDOWS_DEV_DEFAULT_SSH, 'push'], {}))
    .toThrow('only accepts a registered fixed action');
  expect(() => parseWindowsDevControlArgs([
    '--host', WINDOWS_DEV_DEFAULT_SSH, 'verify', '--commit', 'a'.repeat(40)
  ], {})).toThrow('only accepts a registered fixed action');
});

it('pushes dev and then invokes the fixed Windows action', async () => {
  const calls = [];
  const executeGit = vi.fn(async (args) => { calls.push(['git', ...args]); return ''; });
  const executeSsh = vi.fn(async (args) => { calls.push(['ssh', ...args]); return 'remote ok\n'; });
  const stdout = { write: vi.fn() };
  await expect(runWindowsDevControl({
    argv: ['verify'], env: {}, executeGit, executeSsh, stdout
  })).resolves.toMatchObject({ action: 'verify', ref: 'refs/heads/dev' });
  expect(calls[0]).toEqual([
    'git', 'push', '--no-verify', '--porcelain',
    `${WINDOWS_DEV_DEFAULT_SSH}:foliole-dev.git`, '+dev:refs/heads/dev'
  ]);
  expect(calls[1][0]).toBe('ssh');
  expect(calls[1]).toContain('verify');
  expect(calls.flat()).not.toContain('rev-parse');
  expect(stdout.write).toHaveBeenCalledWith('remote ok\n');
});

it('uses only the dedicated Git key and strict host checking', () => {
  const spec = windowsDevPushSpec(WINDOWS_DEV_DEFAULT_SSH, {}, '/Users/dev');
  expect(spec.env.GIT_SSH_COMMAND).toContain('foliole-windows-android-lab-git');
  expect(spec.env.GIT_SSH_COMMAND).toContain('StrictHostKeyChecking=yes');
});

it('uses only the ordinary SSH key and fixed remote action path', () => {
  const spec = windowsDevSshSpec(WINDOWS_DEV_DEFAULT_SSH, 'deploy', {}, TEST_HOME);
  expect(spec).toContain(TEST_WINDOWS_DEV_SSH_KEY);
  expect(spec).toContain('D:/C/foliole/scripts/windows/windows-dev-action.ps1');
  expect(spec.at(-1)).toBe('deploy');
});

it('uses an alphabetic wire action that an old wrapper can pull before normalizing', () => {
  const spec = windowsDevSshSpec(WINDOWS_DEV_DEFAULT_SSH, 'capture-annotation', {}, TEST_HOME);
  expect(spec.at(-1)).toBe('captureannotation');
  expect(spec.at(-1)).toMatch(/^[a-z]+$/u);
  expect(spec).not.toContain('capture-annotation');
});

it('copies only fixed live evidence with the ordinary SSH identity', () => {
  const remotePath = 'D:/C/foliole/.tmp/artifacts/windows-dev-action/dev-1/a5-live.png';
  const spec = windowsDevScpSpec(WINDOWS_DEV_DEFAULT_SSH, remotePath, '/repo/a5.png', {}, TEST_HOME);
  expect(spec).toContain(TEST_WINDOWS_DEV_SSH_KEY);
  expect(spec.at(-2)).toBe(`${WINDOWS_DEV_DEFAULT_SSH}:${remotePath}`);
  expect(spec.at(-1)).toBe('/repo/a5.png');
  expect(parseWindowsDevLiveEvidence(
    `[windows-dev-action] live identity=dev-1 screenshot=${remotePath}\n`
  )).toEqual({ buildIdentity: 'dev-1', remotePath });
  expect(() => parseWindowsDevLiveEvidence(
    '[windows-dev-action] live identity=dev-1 screenshot=C:/Users/dev/private.png\n'
  )).toThrow('escaped its fixed evidence root');
});

it('accepts only the fixed capture annotation manifest root', () => {
  const remoteRoot = 'D:/C/foliole/.tmp/artifacts/windows-dev-action/run-1';
  expect(parseWindowsDevCaptureAnnotationEvidence(
    `[windows-dev-action] capture-annotation identity=run-1 manifest=${remoteRoot}/capture-annotation-manifest.json\n`
  )).toEqual({ buildIdentity: 'run-1', remoteRoot });
  expect(() => parseWindowsDevCaptureAnnotationEvidence(
    '[windows-dev-action] capture-annotation identity=run-1 manifest=C:/Users/dev/private.json\n'
  )).toThrow('escaped its fixed evidence root');
  expect(parseWindowsDevFailureEvidence(
    `[windows-dev-action] status: FAILED exit=74 evidence=${remoteRoot}\\summary.json\n`
  )).toEqual({ buildIdentity: 'run-1', remoteRoot });
});

it('copies live screenshot evidence after the fixed foreground action', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-dev-control-'));
  const remotePath = 'D:/C/foliole/.tmp/artifacts/windows-dev-action/dev-2/a5-live.png';
  const executeScp = vi.fn(async (args) => { fs.writeFileSync(args.at(-1), 'png'); return ''; });
  const result = await runWindowsDevControl({
    argv: ['live'], env: {}, executeGit: vi.fn(async () => ''),
    executeScp, executeSsh: vi.fn(async () =>
      `[windows-dev-action] live identity=dev-2 screenshot=${remotePath}\n`),
    repoRoot, stdout: { write: vi.fn() }
  });
  expect(result).toMatchObject({ action: 'live', screenshotPath: expect.stringContaining('dev-2.png') });
  expect(executeScp).toHaveBeenCalledOnce();
  fs.rmSync(repoRoot, { force: true, recursive: true });
});

it('copies the complete fixed capture annotation evidence set after remote cleanup', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-dev-control-capture-'));
  const remoteRoot = 'D:/C/foliole/.tmp/artifacts/windows-dev-action/run-2';
  const executeScp = vi.fn(async (args) => { fs.writeFileSync(args.at(-1), '{}'); return ''; });
  const result = await runWindowsDevControl({
    argv: ['capture-annotation'], env: {},
    executeGit: vi.fn(async () => ''), executeScp,
    executeSsh: vi.fn(async () =>
      `[windows-dev-action] capture-annotation identity=run-2 manifest=${remoteRoot}/capture-annotation-manifest.json\n`),
    repoRoot, stdout: { write: vi.fn() }
  });
  expect(result).toMatchObject({
    action: 'capture-annotation', evidenceRoot: expect.stringContaining('run-2'),
    manifestPath: expect.stringContaining('capture-annotation-manifest.json')
  });
  expect(executeScp.mock.calls.map(([args]) => path.basename(args.at(-1))).sort()).toEqual([
    'capture-annotation-db-summary.json', 'capture-annotation-manifest.json',
    'capture-annotation-receipt.json', 'capture-annotation-semantic-snapshot.json', 'summary.json'
  ]);
  expect(executeScp.mock.calls.map(([args]) => args.at(-2))).toContain(
    `${WINDOWS_DEV_DEFAULT_SSH}:${remoteRoot}/summary.json`
  );
  fs.rmSync(repoRoot, { force: true, recursive: true });
});

it('copies only fixed capture failure diagnostics before preserving the remote error', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-dev-control-capture-failure-'));
  const remoteRoot = 'D:/C/foliole/.tmp/artifacts/windows-dev-action/run-3';
  const output = `[windows-dev-action] status: FAILED exit=74 evidence=${remoteRoot}/summary.json\n`;
  const remoteError = Object.assign(new Error('remote failed'), { output });
  const executeScp = vi.fn(async (args) => { fs.writeFileSync(args.at(-1), '{}'); return ''; });
  await expect(runWindowsDevControl({
    argv: ['capture-annotation'], env: {},
    executeGit: vi.fn(async () => ''), executeScp,
    executeSsh: vi.fn(async () => { throw remoteError; }), repoRoot, stdout: { write: vi.fn() }
  })).rejects.toBe(remoteError);
  expect(executeScp.mock.calls.map(([args]) => path.basename(args.at(-1)))).toEqual([
    'action.log', 'summary.json'
  ]);
  fs.rmSync(repoRoot, { force: true, recursive: true });
});

it('surfaces remote output before rejecting missing live evidence', async () => {
  const stdout = { write: vi.fn() };
  await expect(runWindowsDevControl({
    argv: ['live'], env: {}, executeGit: vi.fn(async () => ''),
    executeSsh: vi.fn(async () => '[windows-dev-action] status: OK\n'), stdout
  })).rejects.toThrow('did not report screenshot evidence');
  expect(stdout.write).toHaveBeenCalledWith('[windows-dev-action] status: OK\n');
});

it('copies fixed screenshot evidence from a failed live lifecycle before rejecting', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-dev-control-failure-'));
  const remotePath = 'D:/C/foliole/.tmp/artifacts/windows-dev-action/dev-3/a5-live.png';
  const output = `[windows-dev-action] live identity=dev-3 screenshot=${remotePath}\n`;
  const executeScp = vi.fn(async (args) => { fs.writeFileSync(args.at(-1), 'png'); return ''; });
  const remoteError = Object.assign(new Error('remote failed'), { output });
  await expect(runWindowsDevControl({
    argv: ['live'], env: {}, executeGit: vi.fn(async () => ''),
    executeScp, executeSsh: vi.fn(async () => { throw remoteError; }),
    repoRoot, stdout: { write: vi.fn() }
  })).rejects.toThrow('remote failed');
  expect(executeScp).toHaveBeenCalledOnce();
  expect(fs.existsSync(path.join(repoRoot, '.tmp', 'artifacts', 'a5-live-reload', 'dev-3.png'))).toBe(true);
  fs.rmSync(repoRoot, { force: true, recursive: true });
});

it('preserves a remote failure when it exits before screenshot evidence', async () => {
  const stdout = { write: vi.fn() };
  const output = '[windows-dev-action] failure stage=request message=Unknown Windows DEV action\n';
  const remoteError = Object.assign(new Error('remote failed'), { output });
  await expect(runWindowsDevControl({
    argv: ['secondary'], env: {},
    executeGit: vi.fn(async () => ''), executeSsh: vi.fn(async () => { throw remoteError; }), stdout
  })).rejects.toBe(remoteError);
  expect(stdout.write).toHaveBeenCalledWith(output);
});

it('does not resolve or compare commit identifiers', () => {
  const source = fs.readFileSync('scripts/windows/windows-dev-control.mjs', 'utf8');
  expect(source).not.toMatch(/rev-parse|show-current|commitSha|COMMIT_SHA/u);
});

it('does not enter SSH when the ordinary dev push fails', async () => {
  const executeSsh = vi.fn();
  await expect(runWindowsDevControl({
    argv: ['build'], env: {},
    executeGit: vi.fn(async () => { throw new Error('push failed'); }), executeSsh
  })).rejects.toThrow('push failed');
  expect(executeSsh).not.toHaveBeenCalled();
});
