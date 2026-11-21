/* global process */

import path from 'node:path';

import { createDesktopIsolationContext } from '../desktop/playwright-desktop-isolation.mjs';
import {
  MACOS_DAILY_LIBRARY_HOME, MACOS_DEV_LIBRARY_HOME, MACOS_DEV_SYNC_PORT
} from './macos-electron-dev-paths.mjs';

// Agents start DEV through a sandbox-excluded `npm run macos:dev:open *` command, which
// cannot carry an env prefix; the CDP port therefore travels as an argument.
export function splitMacosElectronDevRemoteDebuggingPort(argv) {
  const rest = [];
  let port = null;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index] ?? '';
    let raw;
    if (value === '--remote-debugging-port') {
      raw = argv[index + 1] ?? '';
      index += 1;
    } else if (value.startsWith('--remote-debugging-port=')) {
      raw = value.slice('--remote-debugging-port='.length);
    } else {
      rest.push(value);
      continue;
    }
    if (!/^\d+$/u.test(raw) || Number(raw) < 1024 || Number(raw) > 65535) {
      throw new Error('--remote-debugging-port requires a port between 1024 and 65535');
    }
    port = raw;
  }
  return { argv: rest, port };
}

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
  const explicit = readLibraryHomeArg(argv);
  const libraryHome = explicit ? path.resolve(cwd, explicit) : MACOS_DEV_LIBRARY_HOME;
  if (libraryHome === path.resolve(MACOS_DAILY_LIBRARY_HOME)) {
    throw new Error(`macOS Electron dev refuses the daily library ${MACOS_DAILY_LIBRARY_HOME}`);
  }
  return libraryHome;
}

export function createMacosDailyEnvironment({ env, homeDir, libraryHome, paths, platform }) {
  const isolation = createDesktopIsolationContext({
    ...env,
    FOLIOLE_ELECTRON_TEST_STATE_ROOT: paths.dailyRoot
  }, { homeDir, platform });
  return {
    ...env,
    ...isolation.env,
    FOLIOLE_COMPANION_SYNC_PORT: env.FOLIOLE_COMPANION_SYNC_PORT || MACOS_DEV_SYNC_PORT,
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
