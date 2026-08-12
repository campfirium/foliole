/* global process */

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const macosPath = path.posix;

function checkedSpawn(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: 'pipe' });
  if (result.status === 0) return;
  const detail = result.stderr?.trim() || result.error?.message || `exit ${result.status}`;
  throw new Error(`hidden Electron runtime preparation failed: ${detail}`);
}

export function resolveMacosHiddenElectronSource(appRoot, env = process.env) {
  const executablePath = macosPath.resolve(env.FOLIOLE_ELECTRON_EXECUTABLE_PATH?.trim()
    || macosPath.join(appRoot, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'));
  const marker = `${macosPath.sep}Contents${macosPath.sep}MacOS${macosPath.sep}`;
  const markerIndex = executablePath.lastIndexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`hidden Electron executable is not inside a macOS app bundle: ${executablePath}`);
  }
  const appBundlePath = executablePath.slice(0, markerIndex);
  return {
    appBundlePath,
    executablePath,
    executableRelativePath: macosPath.relative(appBundlePath, executablePath)
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
  const parent = macosPath.join(appRoot, '.tmp', 'native-hidden-electron');
  fileSystem.mkdirSync(parent, { recursive: true });
  const runtimeRoot = fileSystem.mkdtempSync(macosPath.join(parent, 'run-'));
  const targetApp = macosPath.join(runtimeRoot, macosPath.basename(source.appBundlePath));
  try {
    run('/bin/cp', ['-cR', source.appBundlePath, targetApp]);
    run('/usr/bin/plutil', [
      '-replace', 'LSUIElement', '-bool', 'YES', macosPath.join(targetApp, 'Contents', 'Info.plist')
    ]);
    return {
      cleanup: () => fileSystem.rmSync(runtimeRoot, { force: true, recursive: true }),
      executablePath: macosPath.join(targetApp, source.executableRelativePath)
    };
  } catch (error) {
    fileSystem.rmSync(runtimeRoot, { force: true, recursive: true });
    throw error;
  }
}
