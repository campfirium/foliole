// @vitest-environment node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';

import { runWindowsDevBuild } from './windows-dev-build.mjs';

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
    systemNode: path.join(root, 'node.exe') } };
}

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
