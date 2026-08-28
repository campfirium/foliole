/* global process */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createDesktopIsolationContext } from '../desktop/playwright-desktop-isolation.mjs';

function npmBin(platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

export function createMacosNativePreflightCommands({
  cwd = process.cwd(),
  env = process.env,
  homeDir,
  nodeBin = process.execPath,
  platform = process.platform
} = {}) {
  if (platform !== 'darwin') throw new Error('macOS native preflight requires a darwin host.');
  const appRoot = path.resolve(cwd);
  const sandboxRoot = path.join(appRoot, '.tmp', 'macos-desktop-preview');
  createDesktopIsolationContext({
    ...env,
    FOLIOLE_ELECTRON_TEST_STATE_ROOT: sandboxRoot
  }, { homeDir, platform });
  return [
    { args: ['run', 'macos:security-bookmarks:build'], bin: npmBin(platform), cwd: appRoot, env },
    { args: ['run', 'electron:compile'], bin: npmBin(platform), cwd: appRoot, env },
    { args: ['scripts/electron-sqlite-runner.mjs', '--preflight'], bin: nodeBin, cwd: appRoot, env }
  ];
}

function runCommand(command) {
  const child = spawn(command.bin, command.args, {
    cwd: command.cwd,
    env: command.env,
    shell: false,
    stdio: 'inherit'
  });
  return new Promise((resolve) => {
    child.on('error', () => resolve(1));
    child.on('close', (code, signal) => resolve(signal ? 1 : code ?? 1));
  });
}

export async function runMacosNativePreflight(options = {}) {
  for (const command of createMacosNativePreflightCommands(options)) {
    const code = await runCommand(command);
    if (code !== 0) return code;
  }
  process.stdout.write('[macos-native-preflight] status: OK\n');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exitCode = await runMacosNativePreflight();
  } catch (error) {
    process.stderr.write(`[macos-native-preflight] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
