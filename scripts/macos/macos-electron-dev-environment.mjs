/* global process */

import path from 'node:path';

import { createDesktopIsolationContext } from '../desktop/playwright-desktop-isolation.mjs';
import { MACOS_DAILY_LIBRARY_HOME } from './macos-electron-dev-paths.mjs';

function readLibraryHomeArg(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index] ?? '';
    if (value === '--library-home') {
      const libraryHome = argv[index + 1];
      if (!libraryHome || libraryHome.startsWith('--')) {
        throw new Error('--library-home requires a path');
      }
      return libraryHome;
    }
    if (value.startsWith('--library-home=')) {
      const libraryHome = value.slice('--library-home='.length).trim();
      if (!libraryHome) throw new Error('--library-home requires a path');
      return libraryHome;
    }
    throw new Error(`unsupported macOS Electron dev option: ${value}`);
  }
  return null;
}

export function resolveMacosElectronDevLibraryHome(
  argv = process.argv.slice(3),
  cwd = process.cwd()
) {
  const libraryHome = readLibraryHomeArg(argv);
  return libraryHome ? path.resolve(cwd, libraryHome) : MACOS_DAILY_LIBRARY_HOME;
}

export function createMacosDailyEnvironment({ env, homeDir, libraryHome, paths, platform }) {
  const isolation = createDesktopIsolationContext({
    ...env,
    FOLIOLE_ELECTRON_TEST_STATE_ROOT: paths.dailyRoot
  }, { homeDir, platform });
  return {
    ...env,
    ...isolation.env,
    FOLIOLE_DEV_SHELL_RESTART_REQUEST_FILE: paths.shellRequestFile,
    FOLIOLE_ELECTRON_APP_ROOT: paths.appRoot,
    FOLIOLE_LIBRARY_HOME: libraryHome,
    FOLIOLE_MACOS_DAILY_DEBUG: '1',
    FOLIOLE_PREVIEW_SANDBOX: '1',
    FOLIOLE_PREVIEW_SANDBOX_RESET: '0',
    FOLIOLE_PREVIEW_SANDBOX_ROOT: paths.dailyRoot,
    FOLIOLE_VITE_HMR: '1'
  };
}
