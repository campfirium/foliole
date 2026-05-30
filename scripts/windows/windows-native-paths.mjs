/* global URL */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WINDOWS_NATIVE_REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

function joinHostPath(root, ...segments) {
  if (/^[A-Za-z]:\\/u.test(root)) {
    return [root.replace(/\\+$/u, ''), ...segments].join('\\');
  }
  return path.join(root, ...segments);
}

export function resolveWindowsNativePaths(repoRoot = WINDOWS_NATIVE_REPO_ROOT) {
  const userDataPath = joinHostPath(repoRoot, '.tmp', 'electron-user-data');
  // Marker paths must stay aligned with the Electron main boot-report writer.
  return {
    appReadyFile: joinHostPath(repoRoot, '.windows-native-boot-ready.json'),
    bootEventLogFile: joinHostPath(userDataPath, 'logs', 'windows', 'native-boot-events.ndjson'),
    bridgeReadyFile: joinHostPath(repoRoot, '.windows-native-bridge-ready.json'),
    clientScript: joinHostPath(repoRoot, 'scripts', 'windows', 'windows-client-native.mjs'),
    logDir: joinHostPath(repoRoot, '.tmp', 'windows-native-client'),
    nativeAbiScript: joinHostPath(repoRoot, 'scripts', 'windows', 'native-abi-preflight.ps1'),
    nativeStartScript: joinHostPath(repoRoot, 'scripts', 'windows', 'start-electron-dev-native.ps1'),
    reloadDeliveryFile: joinHostPath(repoRoot, '.windows-dev-renderer-reload-delivered.json'),
    repoRoot,
    restartDeliveryFile: joinHostPath(repoRoot, '.windows-dev-restart-delivered.json'),
    shellRestartRequestFile: joinHostPath(repoRoot, '.windows-dev-shell-restart-request.json'),
    stateFile: joinHostPath(repoRoot, '.windows-native-client-state.json'),
    userDataPath,
    windowVisibleFile: joinHostPath(repoRoot, '.windows-native-window-visible.json')
  };
}
