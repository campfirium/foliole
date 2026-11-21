/* global console, process */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { readElectronDevSnapshot } from '../desktop/electron-dev-control-state.mjs';
import {
  assertMacosResetPreviewAvailable,
  formatMacosElectronDevStatus,
  readMacosElectronDevLogs,
  requestMacosElectronFullRestart,
  requestMacosElectronRuntimeRestart,
  resetMacosElectronDev,
  stopMacosElectronDev
} from './macos-electron-dev-actions.mjs';
import {
  resolveMacosElectronDevLibraryHome,
  splitMacosElectronDevRemoteDebuggingPort
} from './macos-electron-dev-environment.mjs';
import { resolveMacosElectronDevPaths } from './macos-electron-dev-paths.mjs';
import { runMacosElectronDev } from './electron-dev-preview.mjs';
import { runMacosElectronDevSupervisor } from './macos-electron-dev-supervisor.mjs';

export const MACOS_ELECTRON_DEV_ACTIONS = new Set([
  'full-restart', 'logs', 'open', 'reset', 'reset-preview', 'restart', 'start', 'status', 'stop'
]);

export function resolveMacosElectronDevOpenMode(snapshot) {
  if (snapshot.running) return 'restart';
  return snapshot.supervisorAlive ? 'recover' : 'start';
}

export function resolveMacosElectronDevAction(argv = process.argv) {
  const action = argv[2] ?? 'status';
  if (!MACOS_ELECTRON_DEV_ACTIONS.has(action)) {
    throw new Error(`unsupported macOS Electron dev action: ${action}`);
  }
  return action;
}

function resolveLaunchOptions(options, paths) {
  const { argv, port } = splitMacosElectronDevRemoteDebuggingPort(options.argv ?? process.argv.slice(3));
  const libraryHome = options.libraryHome ?? resolveMacosElectronDevLibraryHome(argv, paths.appRoot);
  const env = port ? { ...(options.env ?? process.env), FOLIOLE_REMOTE_DEBUGGING_PORT: port } : options.env;
  return { ...options, ...(env ? { env } : {}), libraryHome, paths, port };
}

export async function runMacosElectronDevAction(action, options = {}) {
  const platform = options.platform ?? process.platform;
  if (platform !== 'darwin') throw new Error('macOS Electron dev control requires a darwin host');
  const paths = options.paths ?? resolveMacosElectronDevPaths(options.cwd);
  if (action === 'start') {
    const launch = resolveLaunchOptions(options, paths);
    delete launch.port;
    return runMacosElectronDevSupervisor(launch);
  }
  if (action === 'status') {
    console.log(formatMacosElectronDevStatus(readElectronDevSnapshot(paths)));
    return 0;
  }
  if (action === 'logs') {
    console.log(await readMacosElectronDevLogs(paths));
    return 0;
  }
  if (action === 'open') {
    const mode = resolveMacosElectronDevOpenMode(readElectronDevSnapshot(paths));
    const { port, ...launch } = resolveLaunchOptions(options, paths);
    if (mode === 'restart' && port) {
      // A refresh keeps the supervisor's environment, so a new CDP port needs a fresh start.
      throw new Error('--remote-debugging-port applies when DEV starts; run `npm run macos:dev:stop` first');
    }
    if (mode === 'restart') {
      const snapshot = await requestMacosElectronRuntimeRestart({ paths });
      console.log(`[macos-electron-dev] status: OPENED mode=refreshed session=${snapshot.ready.appReady.session}`);
      return 0;
    }
    if (mode === 'recover') {
      console.error(await readMacosElectronDevLogs(paths));
      await stopMacosElectronDev({ paths });
    }
    console.log(`[macos-electron-dev] status: OPENING mode=${mode}${port ? ` cdp=${port}` : ''}`);
    return runMacosElectronDevSupervisor(launch);
  }
  if (action === 'stop') {
    const stopped = await stopMacosElectronDev({ paths });
    console.log(`[macos-electron-dev] status: ${stopped ? 'STOPPED' : 'ALREADY_STOPPED'}`);
    return 0;
  }
  if (action === 'restart') {
    const snapshot = await requestMacosElectronRuntimeRestart({ paths });
    console.log(`[macos-electron-dev] status: RESTARTED session=${snapshot.ready.appReady.session}`);
    return 0;
  }
  if (action === 'full-restart') {
    const snapshot = await requestMacosElectronFullRestart({ paths });
    console.log(`[macos-electron-dev] status: FULL_RESTARTED session=${snapshot.ready.appReady.session}`);
    return 0;
  }
  if (action === 'reset') {
    await resetMacosElectronDev({ ...options, paths, platform });
    console.log(`[macos-electron-dev] status: RESET root=${paths.dailyRoot}`);
    return 0;
  }
  assertMacosResetPreviewAvailable(paths);
  return runMacosElectronDev({ ...options, platform });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exitCode = await runMacosElectronDevAction(resolveMacosElectronDevAction());
  } catch (error) {
    console.error(`[macos-electron-dev] status: FAILED reason=${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
