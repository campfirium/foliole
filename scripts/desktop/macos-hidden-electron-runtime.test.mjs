// @vitest-environment node

import { Buffer } from 'node:buffer';
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

it('publishes a reusable LSUIElement runtime with stable controller identity', () => {
  const run = vi.fn();
  const rmSync = vi.fn();
  const renameSync = vi.fn();
  const fileSystem = {
    existsSync: vi.fn((target) => target.endsWith('/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
    mkdirSync: vi.fn(),
    mkdtempSync: vi.fn(() => '/repo/foliole/.tmp/native-hidden-electron/stage-one'),
    readFileSync: vi.fn(() => Buffer.from('stable electron executable')),
    renameSync,
    rmSync
  };
  const runtime = prepareMacosHiddenElectronRuntime({
    appRoot: '/repo/foliole', env: {}, fileSystem, run
  });

  expect(run.mock.calls[0]).toEqual([
    '/bin/cp', ['-cR', '/repo/foliole/node_modules/electron/dist/Electron.app',
      '/repo/foliole/.tmp/native-hidden-electron/stage-one/Electron.app']
  ]);
  expect(run.mock.calls[1]).toEqual([
    '/usr/bin/plutil', ['-replace', 'LSUIElement', '-bool', 'YES',
      '/repo/foliole/.tmp/native-hidden-electron/stage-one/Electron.app/Contents/Info.plist']
  ]);
  expect(run.mock.calls[2]).toEqual([
    '/usr/bin/plutil', ['-replace', 'CFBundleIdentifier', '-string',
      'com.foliole.hidden-native',
      '/repo/foliole/.tmp/native-hidden-electron/stage-one/Electron.app/Contents/Info.plist']
  ]);
  expect(runtime.executablePath).toMatch(
    /^\/repo\/foliole\/\.tmp\/native-hidden-electron\/runtime-[a-f0-9]{20}\/Electron\.app\/Contents\/MacOS\/Electron$/
  );
  expect(runtime.keychainAccess).toBe('unverified');
  expect(renameSync).toHaveBeenCalledWith(
    '/repo/foliole/.tmp/native-hidden-electron/stage-one',
    runtime.executablePath.slice(0, runtime.executablePath.indexOf('/Electron.app'))
  );
  runtime.cleanup();
  expect(rmSync).not.toHaveBeenCalled();
});

it('reuses the same prepared runtime without copying or mutating the bundle again', () => {
  const run = vi.fn();
  const fileSystem = {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => Buffer.from('stable electron executable'))
  };

  const first = prepareMacosHiddenElectronRuntime({
    appRoot: '/repo/foliole', env: {}, fileSystem, run
  });
  const second = prepareMacosHiddenElectronRuntime({
    appRoot: '/repo/foliole', env: {}, fileSystem, run
  });

  expect(first.executablePath).toBe(second.executablePath);
  expect(run).not.toHaveBeenCalled();
});

it('uses the atomically published winner when preparation races', () => {
  const conflict = Object.assign(new Error('destination exists'), { code: 'ENOTEMPTY' });
  const rmSync = vi.fn();
  const fileSystem = {
    existsSync: vi.fn((target) => target.endsWith('/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
    mkdirSync: vi.fn(),
    mkdtempSync: vi.fn(() => '/repo/foliole/.tmp/native-hidden-electron/stage-loser'),
    readFileSync: vi.fn(() => Buffer.from('stable electron executable')),
    renameSync: vi.fn(() => { throw conflict; }),
    rmSync
  };

  const runtime = prepareMacosHiddenElectronRuntime({
    appRoot: '/repo/foliole', env: {}, fileSystem, run: vi.fn()
  });

  expect(runtime.executablePath).toContain('/runtime-');
  expect(rmSync).toHaveBeenCalledWith(
    '/repo/foliole/.tmp/native-hidden-electron/stage-loser', { force: true, recursive: true }
  );
});
