// @vitest-environment node

import { expect, it, vi } from 'vitest';

import {
  prepareMacosHiddenElectronRuntime,
  resolveMacosHiddenElectronSource
} from './macos-hidden-electron-runtime.mjs';

it('resolves the raw Electron executable inside its macOS app bundle', () => {
  const appRoot = '/repo/foliole';
  const source = resolveMacosHiddenElectronSource(appRoot, {});

  expect(source.appBundlePath).toBe('/repo/foliole/node_modules/electron/dist/Electron.app');
  expect(source.executableRelativePath).toBe('Contents/MacOS/Electron');
});

it('clones and marks an isolated Electron app as an LSUIElement runtime', () => {
  const run = vi.fn();
  const rmSync = vi.fn();
  const fileSystem = {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    mkdtempSync: vi.fn(() => '/repo/foliole/.tmp/native-hidden-electron/run-one'),
    rmSync
  };
  const runtime = prepareMacosHiddenElectronRuntime({
    appRoot: '/repo/foliole', env: {}, fileSystem, run, runtimeId: 'runtime-one'
  });

  expect(run.mock.calls[0]).toEqual([
    '/bin/cp', ['-cR', '/repo/foliole/node_modules/electron/dist/Electron.app',
      '/repo/foliole/.tmp/native-hidden-electron/run-one/Electron.app']
  ]);
  expect(run.mock.calls[1]).toEqual([
    '/usr/bin/plutil', ['-replace', 'LSUIElement', '-bool', 'YES',
      '/repo/foliole/.tmp/native-hidden-electron/run-one/Electron.app/Contents/Info.plist']
  ]);
  expect(run.mock.calls[2]).toEqual([
    '/usr/bin/plutil', ['-replace', 'CFBundleIdentifier', '-string',
      'com.foliole.hidden-native.runtime-one',
      '/repo/foliole/.tmp/native-hidden-electron/run-one/Electron.app/Contents/Info.plist']
  ]);
  expect(runtime.executablePath).toBe(
    '/repo/foliole/.tmp/native-hidden-electron/run-one/Electron.app/Contents/MacOS/Electron'
  );
  runtime.cleanup();
  expect(rmSync).toHaveBeenCalledWith(
    '/repo/foliole/.tmp/native-hidden-electron/run-one', { force: true, recursive: true }
  );
});
