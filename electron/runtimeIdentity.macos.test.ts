import fs from 'node:fs';
import os from 'node:os';
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

it('keeps a packaged source build out of the official data and library paths', () => {
  const appDataRoot = '/Users/roamer/Library/Application Support';
  const appPath = fs.mkdtempSync(path.join(os.tmpdir(), 'foliole-source-identity-'));
  fs.writeFileSync(path.join(appPath, 'package.json'), JSON.stringify({ folioleBuildChannel: 'source' }));
  const setPath = vi.fn();
  const paths = { userData: path.join(appDataRoot, 'Electron'), sessionData: path.join(appDataRoot, 'Electron') };
  const env: NodeJS.ProcessEnv = {
    FOLIOLE_USER_DATA_PATH: '/Users/roamer/Library/Containers/com.campfirium.foliole/Data/Library/Application Support/foliole',
    FOLIOLE_SESSION_DATA_PATH: '/Users/roamer/Library/Containers/com.campfirium.foliole/Data/Library/Application Support/foliole',
    FOLIOLE_LIBRARY_HOME: '/Users/roamer/Documents/Foliole'
  };
  const app = {
    getAppPath: () => appPath,
    getName: () => FOLIOLE_APP_NAME,
    getPath: (name: 'appData' | 'sessionData' | 'temp' | 'userData') =>
      name === 'appData' ? appDataRoot : paths[name === 'userData' ? 'userData' : 'sessionData'],
    isPackaged: true,
    setName: vi.fn(),
    setPath: (name: 'sessionData' | 'userData', value: string) => {
      paths[name] = value;
      setPath(name, value);
    }
  };
  try {
    const configured = configureRuntimeAppIdentity(app, vi.fn(), 'darwin', env);
    expect(configured.userDataPath).toBe(path.join(appDataRoot, 'foliole-source'));
    expect(configured.libraryHome).toBe(path.join(os.homedir(), 'Documents', 'Foliole Source'));
    expect(setPath).toHaveBeenCalledWith('sessionData', configured.userDataPath);
    expect(env.FOLIOLE_BUILD_CHANNEL).toBe('source');
    expect(env.FOLIOLE_SESSION_DATA_PATH).toBe(configured.userDataPath);
    expect(env.FOLIOLE_LIBRARY_HOME).toBe(configured.libraryHome);
  } finally {
    fs.rmSync(appPath, { force: true, recursive: true });
  }
});
