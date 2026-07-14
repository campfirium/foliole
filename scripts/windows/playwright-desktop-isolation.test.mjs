// @vitest-environment node

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createDesktopIsolationContext } from '../desktop/playwright-desktop-isolation.mjs';

describe('playwright desktop isolation', () => {
  it('pins all desktop test state under the isolated state root', () => {
    const context = createDesktopIsolationContext({
      APPDATA: 'C:\\Users\\Tester\\AppData\\Roaming',
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: 'D:\\Temp\\foliole-playwright-state'
    }, { homeDir: 'C:\\Users\\Tester', platform: 'win32' });

    expect(context).toMatchObject({
      libraryHome: path.win32.join('D:\\Temp\\foliole-playwright-state', 'library'),
      runtimeStateRoot: path.win32.resolve('D:\\Temp\\foliole-playwright-state'),
      sessionDataPath: path.win32.join('D:\\Temp\\foliole-playwright-state', 'session-data'),
      userDataPath: path.win32.join('D:\\Temp\\foliole-playwright-state', 'user-data')
    });
    expect(context.env).toMatchObject({
      FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1',
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: path.win32.resolve('D:\\Temp\\foliole-playwright-state'),
      FOLIOLE_LIBRARY_HOME: path.win32.join('D:\\Temp\\foliole-playwright-state', 'library'),
      FOLIOLE_SESSION_DATA_PATH: path.win32.join('D:\\Temp\\foliole-playwright-state', 'session-data'),
      FOLIOLE_USER_DATA_PATH: path.win32.join('D:\\Temp\\foliole-playwright-state', 'user-data'),
      FOLIOLE_WORKDIR: path.win32.resolve('D:\\Temp\\foliole-playwright-state')
    });
  });

  it('rejects state roots that overlap the fixed main database path', () => {
    expect(() =>
      createDesktopIsolationContext({
        APPDATA: 'C:\\Users\\Tester\\AppData\\Roaming',
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: 'D:\\X\\U\\Foliole'
      }, { homeDir: 'C:\\Users\\Tester', platform: 'win32' })
    ).toThrow('overlaps protected path');
  });

  it('allows persisted library selection only inside the isolated state root', () => {
    const stateRoot = 'D:\\Temp\\foliole-playwright-state';
    const selectedLibrary = path.win32.join(stateRoot, 'selected-library');
    const context = createDesktopIsolationContext({
      APPDATA: 'C:\\Users\\Tester\\AppData\\Roaming',
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot
    }, {
      homeDir: 'C:\\Users\\Tester',
      persistedLibraryHome: selectedLibrary,
      platform: 'win32'
    });

    expect(context.libraryHome).toBe(selectedLibrary);
    expect(context.usesPersistedLibraryHome).toBe(true);
    expect(context.env).not.toHaveProperty('FOLIOLE_LIBRARY_HOME');
  });

  it('rejects persisted library selection outside the isolated state root', () => {
    expect(() => createDesktopIsolationContext({
      APPDATA: 'C:\\Users\\Tester\\AppData\\Roaming',
      FOLIOLE_ELECTRON_TEST_STATE_ROOT: 'D:\\Temp\\foliole-playwright-state'
    }, {
      homeDir: 'C:\\Users\\Tester',
      persistedLibraryHome: 'D:\\Other\\library',
      platform: 'win32'
    })).toThrow('outside state root');
  });

  it('rejects state roots that overlap default Electron userData', () => {
    expect(() =>
      createDesktopIsolationContext({
        APPDATA: 'C:\\Users\\Tester\\AppData\\Roaming',
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: 'C:\\Users\\Tester\\AppData\\Roaming'
      }, { homeDir: 'C:\\Users\\Tester', platform: 'win32' })
    ).toThrow('overlaps protected path');
  });

  it('rejects macOS default Electron userData and internal userData roots', () => {
    const options = { homeDir: '/Users/tester', platform: 'darwin' };
    for (const stateRoot of [
      '/Users/tester/Library/Application Support/foliole',
      '/Users/tester/Library/Application Support/foliole-internal'
    ]) {
      expect(() => createDesktopIsolationContext({
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot
      }, options)).toThrow('overlaps protected path');
    }
  });
});
