/* global process */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { normalizeSpawnCommand } from '../lib/windows-spawn-command.mjs';

function resolveNpmBin() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function shouldSkipBuild(env) {
  return env.FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD?.trim() === '1';
}

function assertExplicitSpecs(argv) {
  if (argv.length === 0 || argv.every((arg) => arg.startsWith('-'))) {
    throw new Error('visible native gate requires at least one explicit Playwright spec.');
  }
}

function runCommand(command) {
  return new Promise((resolve) => {
    const normalizedCommand = normalizeSpawnCommand([command.bin, ...command.args]);
    const child = spawn(normalizedCommand.bin, normalizedCommand.args, {
      cwd: command.cwd,
      env: command.env,
      shell: false,
      stdio: 'inherit'
    });
    child.on('error', (error) => {
      process.stderr.write(`[desktop-native-visible] ${error.message}\n`);
      resolve(1);
    });
    child.on('close', (code, signal) => {
      resolve(signal ? 1 : code ?? 1);
    });
  });
}

export function createNativeVisibleDesktopGateCommand({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
  nodeBin = process.execPath
} = {}) {
  assertExplicitSpecs(argv);
  const appRoot = path.resolve(env.FOLIOLE_ELECTRON_APP_ROOT?.trim() || cwd);
  const launchEnv = {
    ...env,
    FOLIOLE_DISABLE_CHROMIUM_SANDBOX_FOR_DEBUG: '1',
    FOLIOLE_DISABLE_HARDWARE_ACCELERATION: '1',
    FOLIOLE_ELECTRON_APP_ROOT: appRoot,
    FOLIOLE_ELECTRON_NATIVE_VISIBLE: '1',
    FOLIOLE_WINDOWS_WORKDIR: path.resolve(env.FOLIOLE_WINDOWS_WORKDIR?.trim() || cwd)
  };
  delete launchEnv.FOLIOLE_ELECTRON_NATIVE_HIDDEN;

  return {
    args: [
      'scripts/with-resource-gate.mjs',
      'preview',
      '--',
      nodeBin,
      'node_modules/playwright/cli.js',
      'test',
      '--config',
      'playwright.desktop.config.ts',
      ...argv
    ],
    bin: nodeBin,
    cwd: appRoot,
    env: launchEnv
  };
}

export function createNativeVisibleDesktopBuildCommands({
  cwd = process.cwd(),
  env = process.env,
  npmBin = resolveNpmBin()
} = {}) {
  if (shouldSkipBuild(env)) {
    return [];
  }
  const appRoot = path.resolve(env.FOLIOLE_ELECTRON_APP_ROOT?.trim() || cwd);
  return [
    { args: ['run', 'build'], bin: npmBin, cwd: appRoot, env },
    { args: ['run', 'electron:compile'], bin: npmBin, cwd: appRoot, env }
  ];
}

export async function runNativeVisibleDesktopGate(options = {}) {
  const buildCommands = createNativeVisibleDesktopBuildCommands(options);
  const command = createNativeVisibleDesktopGateCommand(options);
  for (const buildCommand of buildCommands) {
    const code = await runCommand(buildCommand);
    if (code !== 0) {
      return code;
    }
  }
  return runCommand(command);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exitCode = await runNativeVisibleDesktopGate();
  } catch (error) {
    process.stderr.write(`[desktop-native-visible] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
