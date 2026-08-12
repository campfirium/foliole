/* global process */

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

function checkedSpawn(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: 'pipe' });
  if (result.status === 0) return;
  const detail = result.stderr?.trim() || result.error?.message || `exit ${result.status}`;
  throw new Error(`hidden Electron runtime preparation failed: ${detail}`);
}

export function resolveMacosHiddenElectronSource(appRoot, env = process.env) {
  const executablePath = path.resolve(env.FOLIOLE_ELECTRON_EXECUTABLE_PATH?.trim()
    || path.join(appRoot, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'));
  const marker = `${path.sep}Contents${path.sep}MacOS${path.sep}`;
  const markerIndex = executablePath.lastIndexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`hidden Electron executable is not inside a macOS app bundle: ${executablePath}`);
  }
  const appBundlePath = executablePath.slice(0, markerIndex);
  return {
    appBundlePath,
    executablePath,
    executableRelativePath: path.relative(appBundlePath, executablePath)
  };
}

export function prepareMacosHiddenElectronRuntime({
  appRoot,
  env = process.env,
  fileSystem = fs,
  run = checkedSpawn
}) {
  const source = resolveMacosHiddenElectronSource(appRoot, env);
  if (!fileSystem.existsSync(source.executablePath)) {
    throw new Error(`hidden Electron executable is missing: ${source.executablePath}`);
  }
  const parent = path.join(appRoot, '.tmp', 'native-hidden-electron');
  fileSystem.mkdirSync(parent, { recursive: true });
  const runtimeRoot = fileSystem.mkdtempSync(path.join(parent, 'run-'));
  const targetApp = path.join(runtimeRoot, path.basename(source.appBundlePath));
  try {
    run('/bin/cp', ['-cR', source.appBundlePath, targetApp]);
    run('/usr/bin/plutil', [
      '-replace', 'LSUIElement', '-bool', 'YES', path.join(targetApp, 'Contents', 'Info.plist')
    ]);
    return {
      cleanup: () => fileSystem.rmSync(runtimeRoot, { force: true, recursive: true }),
      executablePath: path.join(targetApp, source.executableRelativePath)
    };
  } catch (error) {
    fileSystem.rmSync(runtimeRoot, { force: true, recursive: true });
    throw error;
  }
}
