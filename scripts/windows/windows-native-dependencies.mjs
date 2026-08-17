/* global console */

import {
  createNpmCommand, runCapture, runChecked
} from './windows-preview-native-runtime.mjs';

function failureDetail(result) {
  return `${result.stdout}${result.stderr}`.split(/\r?\n/u).slice(-80).join('\n');
}

async function inspect(repoRoot, capture) {
  const command = createNpmCommand(['ls', '--depth=0', '--json', '--silent']);
  return capture(command.command, command.args, { cwd: repoRoot });
}

export async function ensureWindowsNativeDependencies({
  capture = runCapture, checked = runChecked, log = console.log, repoRoot
}) {
  let result = await inspect(repoRoot, capture);
  if (result.code !== 0) {
    log('[windows-preview-native] refresh dependencies from package-lock.json');
    const install = createNpmCommand(['ci', '--no-audit', '--no-fund']);
    await checked(install.command, install.args, 'refresh Windows-native dependencies', repoRoot);
    result = await inspect(repoRoot, capture);
  }
  if (result.code !== 0) {
    const detail = failureDetail(result);
    throw new Error(`node_modules check failed${detail ? `\n${detail}` : ''}`);
  }
  log('[windows-preview-native] node_modules check passed');
}
