/* global process */

import path from 'node:path';

function isNpmCommand(bin) {
  const baseName = path.basename(bin).toLowerCase();
  return baseName === 'npm' || baseName === 'npm.cmd';
}

export function normalizeSpawnCommand(command, platform = process.platform) {
  const [bin, ...args] = command;
  if (platform === 'win32' && isNpmCommand(bin)) {
    return {
      args: ['/d', '/s', '/c', 'npm', ...args],
      bin: 'cmd.exe'
    };
  }
  return { args, bin };
}
