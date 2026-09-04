import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { FOLIOLE_APP_NAME, configureRuntimeAppIdentity } from './runtimeIdentity.js';

it('brands the daily macOS development runtime with its distinct Dock icon', () => {
  const appDataRoot = '/Users/roamer/Library/Application Support';
  const hide = vi.fn();
  const setIcon = vi.fn();
  const app = {
    dock: { hide, setIcon },
    getName: () => FOLIOLE_APP_NAME,
    getPath: (name: 'appData' | 'sessionData' | 'temp' | 'userData') =>
      name === 'appData' ? appDataRoot : path.join(appDataRoot, 'Electron'),
    isPackaged: false,
    setName: vi.fn(),
    setPath: vi.fn()
  };

  configureRuntimeAppIdentity(app, vi.fn(), 'darwin', {
    FOLIOLE_ELECTRON_APP_ROOT: '/repo/foliole',
    FOLIOLE_MACOS_DAILY_DEBUG: '1'
  });

  expect(hide).not.toHaveBeenCalled();
  expect(setIcon).toHaveBeenCalledWith(path.join(path.resolve('/repo/foliole'), 'build', 'icon-dev-macos.png'));
});

it('keeps other unpackaged macOS runtimes on the standard Dock icon', () => {
  const appDataRoot = '/Users/roamer/Library/Application Support';
  const setIcon = vi.fn();
  const app = {
    dock: { hide: vi.fn(), setIcon },
    getName: () => FOLIOLE_APP_NAME,
    getPath: (name: 'appData' | 'sessionData' | 'temp' | 'userData') =>
      name === 'appData' ? appDataRoot : path.join(appDataRoot, 'Electron'),
    isPackaged: false,
    setName: vi.fn(),
    setPath: vi.fn()
  };

  configureRuntimeAppIdentity(app, vi.fn(), 'darwin', {
    FOLIOLE_ELECTRON_APP_ROOT: '/repo/foliole'
  });

  expect(setIcon).toHaveBeenCalledWith(path.join(path.resolve('/repo/foliole'), 'build', 'icon-macos.png'));
});

it('keeps direct-distribution builds on the existing Foliole container data path', () => {
  const appDataRoot = '/Users/roamer/Library/Application Support';
  const setPath = vi.fn();
  const app = {
    getName: () => FOLIOLE_APP_NAME,
    getPath: (name: 'appData' | 'sessionData' | 'temp' | 'userData') =>
      name === 'appData' ? appDataRoot : path.join(appDataRoot, 'Electron'),
    isPackaged: true,
    setName: vi.fn(),
    setPath
  };

  const configured = configureRuntimeAppIdentity(app, vi.fn(), 'darwin', {});
  const expectedRoot = path.join(
    path.dirname(appDataRoot),
    'Containers',
    'com.campfirium.foliole',
    'Data',
    'Library',
    'Application Support'
  );

  expect(configured.appDataRoot).toBe(expectedRoot);
  expect(setPath).toHaveBeenCalledWith('userData', path.join(expectedRoot, FOLIOLE_APP_NAME));
  expect(setPath).toHaveBeenCalledWith('sessionData', path.join(expectedRoot, FOLIOLE_APP_NAME));
});
