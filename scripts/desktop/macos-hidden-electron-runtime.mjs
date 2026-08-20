/* global process */

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const macosPath = path.posix;

function checkedSpawn(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: 'pipe' });
  if (result.status === 0) return;
  const detail = result.stderr?.trim() || result.error?.message || `exit ${result.status}`;
  throw new Error(`hidden Electron runtime preparation failed: ${detail}`);
}

function fingerprintRuntimeSource(executablePath, fileSystem) {
  const contentsPath = macosPath.dirname(macosPath.dirname(executablePath));
  return createHash('sha256')
    .update(fileSystem.readFileSync(executablePath))
    .update(fileSystem.readFileSync(macosPath.join(contentsPath, 'Info.plist')))
    .digest('hex');
}

function publishRuntime(stageRoot, runtimeRoot, fileSystem) {
  try {
    fileSystem.renameSync(stageRoot, runtimeRoot);
  } catch (error) {
    if (!['EEXIST', 'ENOTEMPTY'].includes(error?.code)) throw error;
    fileSystem.rmSync(stageRoot, { force: true, recursive: true });
  }
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
  const sourceFingerprint = fingerprintRuntimeSource(source.executablePath, fileSystem);
  const runtimeRoot = macosPath.join(parent, `runtime-${sourceFingerprint.slice(0, 20)}`);
  const targetApp = macosPath.join(runtimeRoot, macosPath.basename(source.appBundlePath));
  const executablePath = macosPath.join(targetApp, source.executableRelativePath);
  if (fileSystem.existsSync(executablePath)) {
    return { cleanup: () => undefined, executablePath, runtimeIdentity: 'stable-source-bound' };
  }
  if (fileSystem.existsSync(runtimeRoot)) {
    throw new Error(`hidden Electron runtime cache is incomplete: ${runtimeRoot}`);
  }
  const stageRoot = fileSystem.mkdtempSync(macosPath.join(parent, 'stage-'));
  const stageApp = macosPath.join(stageRoot, macosPath.basename(source.appBundlePath));
  try {
    run('/bin/cp', ['-cR', source.appBundlePath, stageApp]);
    const infoPlist = macosPath.join(stageApp, 'Contents', 'Info.plist');
    run('/usr/bin/plutil', ['-replace', 'LSUIElement', '-bool', 'YES', infoPlist]);
    run('/usr/bin/plutil', [
      '-replace', 'CFBundleIdentifier', '-string', 'com.foliole.hidden-native', infoPlist
    ]);
    publishRuntime(stageRoot, runtimeRoot, fileSystem);
    return { cleanup: () => undefined, executablePath, runtimeIdentity: 'stable-source-bound' };
  } catch (error) {
    fileSystem.rmSync(stageRoot, { force: true, recursive: true });
    throw error;
  }
}
