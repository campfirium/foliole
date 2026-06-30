// @vitest-environment node

import path from 'node:path';

import { expect, it, vi } from 'vitest';

import {
  FOLIOLE_INTERNAL_APP_NAME,
  FOLIOLE_INTERNAL_DEFAULT_LIBRARY_HOME,
  FOLIOLE_INTERNAL_PRODUCT_NAME,
  FOLIOLE_WINDOWS_INTERNAL_APP_USER_MODEL_ID,
  configureRuntimeAppIdentity
} from './runtimeIdentity.js';

it('uses a separate identity for internal Windows builds while sharing the production library', () => {
  const appDataRoot = path.join('C:', 'Users', 'zephu', 'AppData', 'Roaming');
  const tempRoot = path.join('C:', 'Users', 'zephu', 'AppData', 'Local', 'Temp');
  let userDataPath = path.join(appDataRoot, 'Electron');
  let sessionDataPath = path.join(appDataRoot, 'Electron');
  const setAppUserModelId = vi.fn();
  const mkdirSync = vi.fn();
  const app = {
    getName: () => FOLIOLE_INTERNAL_PRODUCT_NAME,
    getPath(name: 'appData' | 'sessionData' | 'temp' | 'userData') {
      if (name === 'appData') return appDataRoot;
      if (name === 'temp') return tempRoot;
      return name === 'userData' ? userDataPath : sessionDataPath;
    },
    setAppUserModelId,
    setName: vi.fn(),
    setPath(name: 'sessionData' | 'userData', value: string) {
      if (name === 'userData') userDataPath = value;
      else sessionDataPath = value;
    }
  };

  const configured = configureRuntimeAppIdentity(app, mkdirSync, 'win32');

  expect(app.setName).toHaveBeenCalledWith(FOLIOLE_INTERNAL_PRODUCT_NAME);
  expect(configured.userDataPath).toBe(path.join(appDataRoot, FOLIOLE_INTERNAL_APP_NAME));
  expect(configured.sessionDataPath).toBe(path.join(appDataRoot, FOLIOLE_INTERNAL_APP_NAME));
  expect(configured.libraryHome).toBe(FOLIOLE_INTERNAL_DEFAULT_LIBRARY_HOME);
  expect(setAppUserModelId).toHaveBeenCalledWith(FOLIOLE_WINDOWS_INTERNAL_APP_USER_MODEL_ID);
});
