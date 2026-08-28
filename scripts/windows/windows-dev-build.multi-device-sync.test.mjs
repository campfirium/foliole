// @vitest-environment node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';

import { runWindowsDevBuild } from './windows-dev-build.mjs';
import { allowsSyncGroupNativeClient } from './windows-dev-residual-process.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-formal-c-'));
  const repoRoot = path.join(root, 'repo');
  const signingHome = path.join(root, 'signing');
  const signingKeystore = path.join(signingHome, 'debug.keystore');
  const signingManifest = path.join(root, 'identity.json');
  fs.mkdirSync(repoRoot, { recursive: true }); fs.mkdirSync(signingHome, { recursive: true });
  fs.writeFileSync(signingKeystore, 'keystore');
  fs.writeFileSync(signingManifest, JSON.stringify({
    keystorePath: fs.realpathSync.native(signingKeystore), schemaVersion: 1,
    sha256: createHash('sha256').update('keystore').digest('hex')
  }));
  return { root, paths: { repoRoot, signingHome, signingKeystore, signingManifest,
    gitPath: path.join(root, 'git.exe'), tarPath: path.join(root, 'tar.exe'),
    systemNode: path.join(root, 'node.exe'), systemNpmCli: path.join(root, 'npm-cli.js') } };
}

it('routes desktop DNS-SD acceptance through the fixed runtime control', async () => {
  const { paths, root } = fixture();
  for (const filePath of [paths.systemNode, paths.systemNpmCli, paths.gitPath, paths.tarPath]) {
    fs.writeFileSync(filePath, 'tool');
  }
  const execute = vi.fn(async (command) => {
    if (command === 'powershell.exe') {
      return { code: 0, lines: [], output: '[]\n', stderr: '', stdout: '[]\n' };
    }
    return { code: 0, lines: [], output: 'ok\n', stderr: '', stdout: 'ok\n' };
  });
  const deviceAction = vi.fn();
  const runRouteControl = vi.fn(async () => ({
    desktopDnsSdRouteProvider: { manifestPath: 'route.json' }, output: ''
  }));

  const result = await runWindowsDevBuild({
    action: 'desktop-dnssd-route-provider', deviceAction, execute, paths,
    platform: 'win32', prepareHost: vi.fn(), runRouteControl
  });

  expect(result).toMatchObject({
    exitCode: 0, summary: { desktopDnsSdRouteProvider: { manifestPath: 'route.json' },
      resultStatus: 'success' }
  });
  expect(runRouteControl).toHaveBeenCalledOnce();
  expect(deviceAction).not.toHaveBeenCalled();
  expect(execute.mock.calls.some(([command]) => command === paths.systemNode)).toBe(false);
  fs.rmSync(root, { force: true, recursive: true });
});

it('allows only the trusted native client for provider-backed sync actions', () => {
  const paths = { repoRoot: 'D:\\C\\foliole', systemNode: 'C:\\Program Files\\nodejs\\node.exe' };
  const trusted = { CommandLine: 'cmd.exe /d /c ""C:\\Program Files\\nodejs\\node.exe" '
      + '"D:\\C\\foliole\\scripts\\windows\\electron-dev-native.mjs""', Name: 'cmd.exe' };
  expect(allowsSyncGroupNativeClient('multi-device-sync-c', [trusted], paths)).toBe(true);
  expect(allowsSyncGroupNativeClient('multi-device-sync-candidate', [trusted], paths)).toBe(false);
  expect(allowsSyncGroupNativeClient('multi-device-sync-c', [trusted, { Name: 'java.exe' }], paths))
    .toBe(false);
});

it('consumes the prepared Windows candidate without rebuilding during formal C sync', async () => {
  const { paths, root } = fixture();
  fs.writeFileSync(paths.systemNode, 'node');
  const execute = vi.fn(async () => ({ code: 0, lines: [], output: '[]\n', stderr: '', stdout: '[]\n' }));
  const prepareHost = vi.fn();
  const deviceAction = vi.fn(async () => ({
    multiDeviceSyncC: { manifestPath: 'receipt.json' }, output: 'formal complete\n'
  }));
  const result = await runWindowsDevBuild({
    action: 'multi-device-sync-c', deviceAction, execute, paths,
    platform: 'win32', prepareHost
  });
  expect(result).toMatchObject({ exitCode: 0, summary: {
    action: 'multi-device-sync-c', multiDeviceSyncC: { manifestPath: 'receipt.json' }
  } });
  expect(prepareHost).not.toHaveBeenCalled();
  expect(deviceAction).toHaveBeenCalledOnce();
  expect(execute.mock.calls.some(([command]) => command === 'cmd.exe')).toBe(false);
  fs.rmSync(root, { force: true, recursive: true });
});

it('runs A-rejoin against the prepared Windows candidate without rebuilding', async () => {
  const { paths, root } = fixture();
  fs.writeFileSync(paths.systemNode, 'node');
  const execute = vi.fn(async () => ({ code: 0, lines: [], output: '[]\n', stderr: '', stdout: '[]\n' }));
  const prepareHost = vi.fn();
  const deviceAction = vi.fn(async () => ({
    multiDeviceSyncARejoin: { manifestPath: 'a-rejoin.json' }, output: 'rejoin complete\n'
  }));
  const result = await runWindowsDevBuild({ action: 'multi-device-sync-a-rejoin',
    deviceAction, execute, paths, platform: 'win32', prepareHost });
  expect(result.summary).toMatchObject({ action: 'multi-device-sync-a-rejoin',
    multiDeviceSyncARejoin: { manifestPath: 'a-rejoin.json' } });
  expect(prepareHost).not.toHaveBeenCalled();
  fs.rmSync(root, { force: true, recursive: true });
});

it('runs A-leave against the prepared Windows candidate without rebuilding', async () => {
  const { paths, root } = fixture();
  fs.writeFileSync(paths.systemNode, 'node');
  const deviceAction = vi.fn(async () => ({
    multiDeviceSyncALeave: { manifestPath: 'a-leave.json' }, output: 'leave complete\n'
  }));
  const result = await runWindowsDevBuild({ action: 'multi-device-sync-a-leave', deviceAction,
    execute: vi.fn(async () => ({ code: 0, lines: [], output: '[]\n', stderr: '', stdout: '[]\n' })),
    paths, platform: 'win32', prepareHost: vi.fn() });
  expect(result.summary).toMatchObject({ action: 'multi-device-sync-a-leave',
    multiDeviceSyncALeave: { manifestPath: 'a-leave.json' } });
  fs.rmSync(root, { force: true, recursive: true });
});

it('runs participation control against the prepared Windows candidate without rebuilding', async () => {
  const { paths, root } = fixture();
  fs.writeFileSync(paths.systemNode, 'node');
  const deviceAction = vi.fn(async () => ({
    multiDeviceSyncParticipation: { manifestPath: 'participation.json' }, output: 'complete\n'
  }));
  const result = await runWindowsDevBuild({ action: 'multi-device-sync-participation', deviceAction,
    execute: vi.fn(async () => ({ code: 0, lines: [], output: '[]\n', stderr: '', stdout: '[]\n' })),
    paths, platform: 'win32', prepareHost: vi.fn() });
  expect(result.summary).toMatchObject({ action: 'multi-device-sync-participation',
    multiDeviceSyncParticipation: { manifestPath: 'participation.json' } });
  fs.rmSync(root, { force: true, recursive: true });
});

it('runs sync-from-zero against the prepared Windows candidate without rebuilding', async () => {
  const { paths, root } = fixture();
  fs.writeFileSync(paths.systemNode, 'node');
  const deviceAction = vi.fn(async () => ({
    multiDeviceSyncFromZero: { manifestPath: 'sync-from-zero.json' }, output: 'complete\n'
  }));
  const prepareHost = vi.fn();
  const result = await runWindowsDevBuild({ action: 'multi-device-sync-from-zero', deviceAction,
    execute: vi.fn(async () => ({ code: 0, lines: [], output: '[]\n', stderr: '', stdout: '[]\n' })),
    paths, platform: 'win32', prepareHost });
  expect(result.summary).toMatchObject({ action: 'multi-device-sync-from-zero',
    multiDeviceSyncFromZero: { manifestPath: 'sync-from-zero.json' } });
  expect(prepareHost).not.toHaveBeenCalled();
  fs.rmSync(root, { force: true, recursive: true });
});
