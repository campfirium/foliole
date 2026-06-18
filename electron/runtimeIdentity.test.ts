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
  const tempRoot = path.join('C:', 'Users', 'zephu', 'AppData', 'Local', 'Temp');
  let userDataPath = path.join(appDataRoot, 'Electron');
  let sessionDataPath = path.join(appDataRoot, 'Electron');
  const setAppUserModelId = vi.fn();
  const mkdirSync = vi.fn();
  const app = {
    getName: () => FOLIOLE_APP_NAME,
    getPath(name: 'appData' | 'sessionData' | 'temp' | 'userData') {
      if (name === 'appData') {
        return appDataRoot;
      }
      if (name === 'temp') {
        return tempRoot;
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
  expect(configured.libraryHome).toBeNull();
  expect(setAppUserModelId).toHaveBeenCalledWith(FOLIOLE_APP_NAME);
  expect(mkdirSync).toHaveBeenCalledWith(expectedRoot, { recursive: true });
});

it('honors test-specific userData and sessionData overrides', () => {
  const appDataRoot = path.join('C:', 'Users', 'zephu', 'AppData', 'Roaming');
  const tempRoot = path.join('C:', 'Users', 'zephu', 'AppData', 'Local', 'Temp');
  let userDataPath = path.join(appDataRoot, 'Electron');
  let sessionDataPath = path.join(appDataRoot, 'Electron');
  const mkdirSync = vi.fn();
  const app = {
    getName: () => FOLIOLE_APP_NAME,
    getPath(name: 'appData' | 'sessionData' | 'temp' | 'userData') {
      if (name === 'appData') {
        return appDataRoot;
      }
      if (name === 'temp') {
        return tempRoot;
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

  const env: NodeJS.ProcessEnv = {
    FOLIOLE_SESSION_DATA_PATH: '/tmp/foliole-test/session-data',
    FOLIOLE_USER_DATA_PATH: '/tmp/foliole-test/user-data'
  };
  const configured = configureRuntimeAppIdentity(app, mkdirSync, 'linux', env);

  expect(configured.userDataPath).toBe(path.resolve('/tmp/foliole-test/user-data'));
  expect(configured.sessionDataPath).toBe(path.resolve('/tmp/foliole-test/session-data'));
  expect(configured.libraryHome).toBeNull();
  expect(mkdirSync).toHaveBeenCalledWith(path.resolve('/tmp/foliole-test/user-data'), { recursive: true });
  expect(mkdirSync).toHaveBeenCalledWith(path.resolve('/tmp/foliole-test/session-data'), { recursive: true });
});

it('honors the explicit library home launch argument before runtime settings load', () => {
  const appDataRoot = path.join('C:', 'Users', 'zephu', 'AppData', 'Roaming');
  const tempRoot = path.join('C:', 'Users', 'zephu', 'AppData', 'Local', 'Temp');
  let userDataPath = path.join(appDataRoot, 'Electron');
  let sessionDataPath = path.join(appDataRoot, 'Electron');
  const env: NodeJS.ProcessEnv = {};
  const app = {
    getName: () => FOLIOLE_APP_NAME,
    getPath(name: 'appData' | 'sessionData' | 'temp' | 'userData') {
      if (name === 'appData') {
        return appDataRoot;
      }
      if (name === 'temp') {
        return tempRoot;
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

  const configured = configureRuntimeAppIdentity(
    app,
    vi.fn(),
    'linux',
    env,
    ['electron', 'main.js', '--library-home', '/tmp/foliole-demo']
  );

  expect(configured.libraryHome).toBe(path.resolve('/tmp/foliole-demo'));
  expect(env.FOLIOLE_LIBRARY_HOME).toBe(path.resolve('/tmp/foliole-demo'));
});

it('turns a sample locale launch into a parallel temporary sample sandbox', () => {
  const appDataRoot = path.join('C:', 'Users', 'zephu', 'AppData', 'Roaming');
  const tempRoot = path.join('C:', 'Users', 'zephu', 'AppData', 'Local', 'Temp');
  const sandboxRoot = path.join(tempRoot, FOLIOLE_APP_NAME, 'preview-sandbox');
  let userDataPath = path.join(appDataRoot, 'Electron');
  let sessionDataPath = path.join(appDataRoot, 'Electron');
  const env: NodeJS.ProcessEnv = {};
  const mkdirSync = vi.fn();
  const rmSync = vi.fn();
  const app = {
    getName: () => FOLIOLE_APP_NAME,
    getPath(name: 'appData' | 'sessionData' | 'temp' | 'userData') {
      if (name === 'appData') {
        return appDataRoot;
      }
      if (name === 'temp') {
        return tempRoot;
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

  const configured = configureRuntimeAppIdentity(
    app,
    mkdirSync,
    'win32',
    env,
    ['Foliole.exe', '--sample-locale=en-US'],
    rmSync
  );

  expect(configured.previewSandbox).toBe(true);
  expect(configured.userDataPath).toBe(path.join(sandboxRoot, 'user-data'));
  expect(configured.sessionDataPath).toBe(path.join(sandboxRoot, 'user-data'));
  expect(configured.libraryHome).toBe(path.join(sandboxRoot, 'library'));
  expect(env.FOLIOLE_ALLOW_PARALLEL_INSTANCE).toBe('1');
  expect(env.FOLIOLE_LIBRARY_HOME).toBe(path.join(sandboxRoot, 'library'));
  expect(env.FOLIOLE_GUIDED_SAMPLE_LOCALE).toBe('en-US');
  expect(rmSync).toHaveBeenCalledWith(path.join(sandboxRoot, 'library'), { force: true, recursive: true });
  expect(rmSync).toHaveBeenCalledWith(path.join(sandboxRoot, 'user-data'), { force: true, recursive: true });
  expect(mkdirSync).toHaveBeenCalledWith(path.join(sandboxRoot, 'library'), { recursive: true });
});

it('refuses to reset protected paths for preview sandbox launches', () => {
  const appDataRoot = path.join('C:', 'Users', 'zephu', 'AppData', 'Roaming');
  const env: NodeJS.ProcessEnv = {
    FOLIOLE_PREVIEW_SANDBOX: '1',
    FOLIOLE_USER_DATA_PATH: path.join(appDataRoot, FOLIOLE_APP_NAME)
  };
  const app = {
    getName: () => FOLIOLE_APP_NAME,
    getPath(name: 'appData' | 'sessionData' | 'temp' | 'userData') {
      if (name === 'appData') return appDataRoot;
      if (name === 'temp') return path.join('C:', 'Temp');
      return path.join(appDataRoot, 'Electron');
    },
    setName: vi.fn(),
    setPath: vi.fn()
  };

  expect(() =>
    configureRuntimeAppIdentity(app, vi.fn(), 'win32', env, ['Foliole.exe'], vi.fn())
  ).toThrow(/refusing preview sandbox reset/);
});

it('collects machine-checkable runtime diagnostics for the active startup context', () => {
  const runtimeDir = path.join('C:', 'dev', 'foliole', 'dist', 'electron');
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
