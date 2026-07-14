/* global process */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createDesktopIsolationContext } from '../desktop/playwright-desktop-isolation.mjs';
import { MACOS_RESET_PREVIEW_ROOT } from './macos-electron-dev-paths.mjs';

export function createMacosElectronDevCommand({
  cwd = process.cwd(),
  env = process.env,
  homeDir,
  nodeBin = process.execPath,
  platform = process.platform
} = {}) {
  if (platform !== 'darwin') throw new Error('macOS Electron preview requires a darwin host.');
  const appRoot = path.resolve(cwd);
  const sandboxRoot = path.join(appRoot, MACOS_RESET_PREVIEW_ROOT);
  const isolation = createDesktopIsolationContext({
    ...env,
    FOLIOLE_ELECTRON_TEST_STATE_ROOT: sandboxRoot
  }, { homeDir, platform });
  const launchEnv = {
    ...env,
    ...isolation.env,
    FOLIOLE_ELECTRON_APP_ROOT: appRoot,
    FOLIOLE_PREVIEW_SANDBOX: '1',
    FOLIOLE_PREVIEW_SANDBOX_RESET: '1',
    FOLIOLE_PREVIEW_SANDBOX_ROOT: sandboxRoot
  };
  delete launchEnv.FOLIOLE_WINDOWS_WORKDIR;
  return {
    args: [
      'scripts/with-resource-gate.mjs', 'preview', '--',
      nodeBin, 'scripts/electron-dev.mjs', '--preview-sandbox'
    ],
    bin: nodeBin,
    cwd: appRoot,
    env: launchEnv,
    sandboxRoot
  };
}

export async function runMacosElectronDev(options = {}) {
  const command = createMacosElectronDevCommand(options);
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

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exitCode = await runMacosElectronDev();
  } catch (error) {
    process.stderr.write(`[macos-electron-dev] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
