// @vitest-environment node

import { expect, it, vi } from 'vitest';

import {
  MACOS_ELECTRON_DEV_BUNDLE_ID,
  MACOS_ELECTRON_DEV_BUNDLE_NAME,
  MACOS_ELECTRON_DEV_SIGNING_IDENTITY,
  prepareMacosElectronDevSignature
} from './macos-electron-dev-signature.mjs';

it('signs the DEV Electron bundle with one stable product identity', async () => {
  const plist = new Map([
    ['CFBundleIdentifier', 'Electron'],
    ['CFBundleName', 'Electron'],
    ['CFBundleDisplayName', 'Electron']
  ]);
  let signed = false;
  const run = vi.fn((command, args) => {
    if (command.endsWith('security')) {
      return { stdout: `1) HASH "${MACOS_ELECTRON_DEV_SIGNING_IDENTITY}"\n`, stderr: '' };
    }
    if (command.endsWith('plutil') && args[0] === '-extract') {
      return { stdout: `${plist.get(args[1])}\n`, stderr: '' };
    }
    if (command.endsWith('plutil')) {
      plist.set(args[1], args[3]);
      return { stdout: '', stderr: '' };
    }
    if (command.endsWith('codesign') && args[0] === '-dv') {
      return { stdout: '', stderr: signed ? `Authority=${MACOS_ELECTRON_DEV_SIGNING_IDENTITY}\n` : 'Signature=adhoc\n' };
    }
    return { stdout: '', stderr: '' };
  });
  const sign = vi.fn(async () => { signed = true; });

  await expect(prepareMacosElectronDevSignature({ appRoot: '/repo', platform: 'darwin', run, sign }))
    .resolves.toEqual({ changed: true, reason: 'signed' });
  expect(plist.get('CFBundleIdentifier')).toBe(MACOS_ELECTRON_DEV_BUNDLE_ID);
  expect(plist.get('CFBundleName')).toBe(MACOS_ELECTRON_DEV_BUNDLE_NAME);
  expect(plist.get('CFBundleDisplayName')).toBe(MACOS_ELECTRON_DEV_BUNDLE_NAME);
  expect(sign).toHaveBeenCalledWith(expect.objectContaining({
    app: '/repo/node_modules/electron/dist/Electron.app',
    identity: MACOS_ELECTRON_DEV_SIGNING_IDENTITY,
    optionsForFile: expect.any(Function),
    platform: 'darwin'
  }));
  expect(sign.mock.calls[0][0].optionsForFile('/nested')).toEqual({
    hardenedRuntime: false,
    timestamp: 'none'
  });
  expect(run).toHaveBeenCalledWith('/usr/bin/codesign', [
    '--verify', '--deep', '--strict', '/repo/node_modules/electron/dist/Electron.app'
  ]);
});

it('keeps an already verified stable signature untouched', async () => {
  const run = vi.fn((command, args) => {
    if (command.endsWith('security')) {
      return { stdout: `1) HASH "${MACOS_ELECTRON_DEV_SIGNING_IDENTITY}"\n`, stderr: '' };
    }
    if (command.endsWith('plutil')) {
      const value = args[1] === 'CFBundleIdentifier'
        ? MACOS_ELECTRON_DEV_BUNDLE_ID
        : MACOS_ELECTRON_DEV_BUNDLE_NAME;
      return { stdout: `${value}\n`, stderr: '' };
    }
    if (args[0] === '-dv') {
      return { stdout: '', stderr: `Authority=${MACOS_ELECTRON_DEV_SIGNING_IDENTITY}\n` };
    }
    return { stdout: '', stderr: '' };
  });

  const sign = vi.fn();
  await expect(prepareMacosElectronDevSignature({ appRoot: '/repo', platform: 'darwin', run, sign }))
    .resolves.toEqual({ changed: false, reason: 'already-signed' });
  expect(sign).not.toHaveBeenCalled();
});

it('fails closed when the stable signing identity is unavailable', async () => {
  const run = vi.fn(() => ({ stdout: '0 valid identities found\n', stderr: '' }));
  await expect(prepareMacosElectronDevSignature({ appRoot: '/repo', platform: 'darwin', run }))
    .rejects.toThrow('signing identity is unavailable');
});
