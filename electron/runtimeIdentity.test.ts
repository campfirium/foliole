// @vitest-environment node

import path from 'node:path';

import { expect, it, vi } from 'vitest';

import {
  FOLIOLE_APP_NAME,
  collectRuntimeDiagnosticsSnapshot,
  configureRuntimeAppIdentity,
  formatRuntimeDiagnosticsSnapshot
} from './runtimeIdentity.js';

function createExistsSync(paths: string[]) {
  const normalized = new Set(paths.map((filePath) => path.normalize(filePath)));
  return (filePath: string) => normalized.has(path.normalize(filePath));
}

it('pins userData and sessionData to the foliole root on win32', () => {
  const appDataRoot = path.join('C:', 'Users', 'zephu', 'AppData', 'Roaming');
  let userDataPath = path.join(appDataRoot, 'Electron');
  let sessionDataPath = path.join(appDataRoot, 'Electron');
  const setAppUserModelId = vi.fn();
  const mkdirSync = vi.fn();
  const app = {
    getName: () => FOLIOLE_APP_NAME,
    getPath(name: 'appData' | 'sessionData' | 'userData') {
      if (name === 'appData') {
        return appDataRoot;
      }
      return name === 'userData' ? userDataPath : sessionDataPath;
    },
    setAppUserModelId,
    setName: vi.fn(),
    setPath(name: 'sessionData' | 'userData', value: string) {
      if (name === 'userData') {
        userDataPath = value;
        return;
      }
      sessionDataPath = value;
    }
  };

  const configured = configureRuntimeAppIdentity(app, mkdirSync, 'win32');

  const expectedRoot = path.join(appDataRoot, FOLIOLE_APP_NAME);
  expect(configured.userDataPath).toBe(expectedRoot);
  expect(configured.sessionDataPath).toBe(expectedRoot);
  expect(setAppUserModelId).toHaveBeenCalledWith(FOLIOLE_APP_NAME);
  expect(mkdirSync).toHaveBeenCalledWith(expectedRoot, { recursive: true });
});

it('honors test-specific userData and sessionData overrides', () => {
  const appDataRoot = path.join('C:', 'Users', 'zephu', 'AppData', 'Roaming');
  let userDataPath = path.join(appDataRoot, 'Electron');
  let sessionDataPath = path.join(appDataRoot, 'Electron');
  const mkdirSync = vi.fn();
  const app = {
    getName: () => FOLIOLE_APP_NAME,
    getPath(name: 'appData' | 'sessionData' | 'userData') {
      if (name === 'appData') {
        return appDataRoot;
      }
      return name === 'userData' ? userDataPath : sessionDataPath;
    },
    setName: vi.fn(),
    setPath(name: 'sessionData' | 'userData', value: string) {
      if (name === 'userData') {
        userDataPath = value;
        return;
      }
      sessionDataPath = value;
    }
  };

  const configured = configureRuntimeAppIdentity(app, mkdirSync, 'linux', {
    FOLIOLE_SESSION_DATA_PATH: '/tmp/foliole-test/session-data',
    FOLIOLE_USER_DATA_PATH: '/tmp/foliole-test/user-data'
  });

  expect(configured.userDataPath).toBe(path.resolve('/tmp/foliole-test/user-data'));
  expect(configured.sessionDataPath).toBe(path.resolve('/tmp/foliole-test/session-data'));
  expect(mkdirSync).toHaveBeenCalledWith(path.resolve('/tmp/foliole-test/user-data'), { recursive: true });
  expect(mkdirSync).toHaveBeenCalledWith(path.resolve('/tmp/foliole-test/session-data'), { recursive: true });
});

it('collects machine-checkable runtime diagnostics for the active startup context', () => {
  const runtimeDir = path.join('C:', 'dev', 'foliole', 'electron-dist', 'electron');
  const preloadPath = path.join('C:', 'dev', 'foliole', 'electron', 'preload.cjs');
  const snapshot = collectRuntimeDiagnosticsSnapshot({
    appName: FOLIOLE_APP_NAME,
    env: { ELECTRON_RENDERER_URL: 'http://127.0.0.1:24600' },
    existsSync: createExistsSync([preloadPath]),
    runtimeDir,
    userDataPath: path.join('C:', 'Users', 'zephu', 'AppData', 'Roaming', 'foliole')
  });

  expect(snapshot).toEqual({
    appName: FOLIOLE_APP_NAME,
    preloadPath,
    rendererUrl: 'http://127.0.0.1:24600',
    userDataPath: path.join('C:', 'Users', 'zephu', 'AppData', 'Roaming', 'foliole')
  });
  expect(JSON.parse(formatRuntimeDiagnosticsSnapshot(snapshot))).toEqual({
    type: 'runtime_context',
    ...snapshot
  });
});
