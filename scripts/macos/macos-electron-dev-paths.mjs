/* global process */

import path from 'node:path';

import { resolveElectronDevArtifactPaths } from '../desktop/electron-dev-control-state.mjs';

export const MACOS_DAILY_DEBUG_ROOT = path.join('.tmp', 'macos-desktop-daily-debug');
export const MACOS_DAILY_LIBRARY_HOME = '/Users/roamer/Documents/Foliole';
export const MACOS_RESET_PREVIEW_ROOT = path.join('.tmp', 'macos-desktop-reset-preview');

export function resolveMacosElectronDevPaths(cwd = process.cwd()) {
  const appRoot = path.resolve(cwd);
  const dailyRoot = path.join(appRoot, MACOS_DAILY_DEBUG_ROOT);
  const resetPreviewRoot = path.join(appRoot, MACOS_RESET_PREVIEW_ROOT);
  const artifacts = resolveElectronDevArtifactPaths(dailyRoot);
  return {
    ...artifacts,
    appRoot,
    dailyLogFile: path.join(dailyRoot, 'logs', 'macos', 'daily-debug.log'),
    dailyRoot,
    resetPreviewRoot,
    shellRequestFile: path.join(dailyRoot, '.foliole-dev-shell-restart-request.json')
  };
}
