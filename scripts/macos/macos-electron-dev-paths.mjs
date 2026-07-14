/* global process */

import path from 'node:path';

import { resolveElectronDevArtifactPaths } from '../desktop/electron-dev-control-state.mjs';

export const MACOS_DAILY_DEBUG_ROOT = path.join('.tmp', 'macos-desktop-daily-debug');
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

export function resolveMacosElectronWatchTargets(paths) {
  const sourceExtension = /\.(?:cjs|json|mjs|ts)$/u;
  return [
    {
      matches: (fileName) => sourceExtension.test(fileName),
      path: path.join(paths.appRoot, 'electron'),
      recursive: true
    },
    {
      matches: (fileName) => /\.ts$/u.test(fileName),
      path: path.join(paths.appRoot, 'lib'),
      recursive: true
    },
    {
      matches: (fileName) => fileName === 'foliole-agent-routes.mjs',
      path: path.join(paths.appRoot, 'scripts', 'agent-control'),
      recursive: false
    }
  ];
}
