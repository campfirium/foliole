/* global console, process */

import fs from 'node:fs';
import path from 'node:path';

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
  capture = runCapture, checked = runChecked, fileSystem = fs, log = console.log, repoRoot
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
  const electronExecutable = path.join(repoRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
  if (!fileSystem.existsSync(electronExecutable)) {
    log('[windows-preview-native] install Electron runtime');
    const installer = path.join(repoRoot, 'node_modules', 'electron', 'install.js');
    await checked(process.execPath, [installer], 'install Windows Electron runtime', repoRoot);
    if (!fileSystem.existsSync(electronExecutable)) {
      throw new Error('Electron runtime installation did not produce electron.exe');
    }
  }
  log('[windows-preview-native] node_modules check passed');
}
