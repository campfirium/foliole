// @vitest-environment node

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createDesktopIsolationContext } from './playwright-desktop-isolation.mjs';

describe('playwright desktop isolation', () => {
  it('pins all desktop test state under the isolated state root', () => {
    const context = createDesktopIsolationContext({
      APPDATA: 'C:\\Users\\Tester\\AppData\\Roaming',
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: 'D:\\Temp\\foliole-playwright-state'
    });

    expect(context).toMatchObject({
      libraryHome: path.join('D:\\Temp\\foliole-playwright-state', 'library'),
      runtimeStateRoot: path.resolve('D:\\Temp\\foliole-playwright-state'),
      sessionDataPath: path.join('D:\\Temp\\foliole-playwright-state', 'session-data'),
      userDataPath: path.join('D:\\Temp\\foliole-playwright-state', 'user-data')
    });
    expect(context.env).toMatchObject({
      FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1',
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: path.resolve('D:\\Temp\\foliole-playwright-state'),
      FOLIOLE_LIBRARY_HOME: path.join('D:\\Temp\\foliole-playwright-state', 'library'),
      FOLIOLE_SESSION_DATA_PATH: path.join('D:\\Temp\\foliole-playwright-state', 'session-data'),
      FOLIOLE_USER_DATA_PATH: path.join('D:\\Temp\\foliole-playwright-state', 'user-data'),
      FOLIOLE_WORKDIR: path.resolve('D:\\Temp\\foliole-playwright-state')
    });
  });

  it('rejects state roots that overlap the fixed main database path', () => {
    expect(() =>
      createDesktopIsolationContext({
        APPDATA: 'C:\\Users\\Tester\\AppData\\Roaming',
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: 'D:\\X\\U\\Foliole'
      })
    ).toThrow('overlaps protected path');
  });

  it('rejects state roots that overlap default Electron userData', () => {
    expect(() =>
      createDesktopIsolationContext({
        APPDATA: 'C:\\Users\\Tester\\AppData\\Roaming',
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: 'C:\\Users\\Tester\\AppData\\Roaming'
      })
    ).toThrow('overlaps protected path');
  });
});
