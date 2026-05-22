/* global URL */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WINDOWS_NATIVE_REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

export function resolveWindowsNativePaths(repoRoot = WINDOWS_NATIVE_REPO_ROOT) {
  // Marker paths must stay aligned with the Electron main boot-report writer.
  return {
    appReadyFile: path.join(repoRoot, '.windows-native-boot-ready.json'),
    bootEventLogFile: path.join(repoRoot, '.electron-user-data', 'logs', 'windows', 'native-boot-events.ndjson'),
    bridgeReadyFile: path.join(repoRoot, '.windows-native-bridge-ready.json'),
    clientScript: path.join(repoRoot, 'scripts', 'windows', 'windows-client-native.mjs'),
    logDir: path.join(repoRoot, '.tmp', 'windows-native-client'),
    nativeAbiScript: path.join(repoRoot, 'scripts', 'windows', 'native-abi-preflight.ps1'),
    nativeStartScript: path.join(repoRoot, 'scripts', 'windows', 'start-electron-dev-native.ps1'),
    reloadDeliveryFile: path.join(repoRoot, '.windows-dev-renderer-reload-delivered.json'),
    repoRoot,
    restartDeliveryFile: path.join(repoRoot, '.windows-dev-restart-delivered.json'),
    shellRestartRequestFile: path.join(repoRoot, '.windows-dev-shell-restart-request.json'),
    stateFile: path.join(repoRoot, '.windows-native-client-state.json'),
    userDataPath: path.join(repoRoot, '.electron-user-data'),
    windowVisibleFile: path.join(repoRoot, '.windows-native-window-visible.json')
  };
}
