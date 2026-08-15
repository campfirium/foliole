/* global process */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { appendDesktopHostTimelineEvent } from '../diagnostics/desktop-host-timeline.mjs';
import { normalizeSpawnCommand } from '../lib/spawn-command.mjs';
import { prepareMacosHiddenElectronRuntime } from './macos-hidden-electron-runtime.mjs';

export const HIDDEN_MODE_HEALTH_SPECS = [
  'tests/desktop/hidden-native-presentation.spec.ts',
  'tests/desktop/agent-control-visible-write.spec.ts'
];

function resolveNpmBin() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function shouldSkipBuild(env) {
  return env.FOLIOLE_DESKTOP_NATIVE_SKIP_BUILD?.trim() === '1';
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
      process.stderr.write(`[desktop-native-hidden] ${error.message}\n`);
      resolve(1);
    });
    child.on('close', (code, signal) => {
      resolve(signal ? 1 : code ?? 1);
    });
  });
}

export function createNativeHiddenDesktopGateCommand({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
  nodeBin = process.execPath,
  platform = process.platform
} = {}) {
  const appRoot = path.resolve(env.FOLIOLE_ELECTRON_APP_ROOT?.trim() || cwd);
  const testArgs = argv.length > 0 ? argv : HIDDEN_MODE_HEALTH_SPECS;
  const launchEnv = {
    ...env,
    FOLIOLE_ELECTRON_APP_ROOT: appRoot,
    FOLIOLE_ELECTRON_NATIVE_HIDDEN: '1',
    FOLIOLE_DESKTOP_ACCEPTANCE_EVIDENCE: '1'
  };
  if (platform === 'win32') {
    launchEnv.FOLIOLE_DISABLE_CHROMIUM_SANDBOX_FOR_DEBUG = '1';
    launchEnv.FOLIOLE_DISABLE_HARDWARE_ACCELERATION = '1';
    launchEnv.FOLIOLE_WINDOWS_WORKDIR = path.resolve(env.FOLIOLE_WINDOWS_WORKDIR?.trim() || cwd);
  } else {
    delete launchEnv.FOLIOLE_DISABLE_CHROMIUM_SANDBOX_FOR_DEBUG;
    delete launchEnv.FOLIOLE_DISABLE_HARDWARE_ACCELERATION;
    delete launchEnv.FOLIOLE_WINDOWS_WORKDIR;
  }

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
      ...testArgs
    ],
    bin: nodeBin,
    cwd: appRoot,
    env: launchEnv
  };
}

export function createNativeHiddenDesktopBuildCommands({
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

export async function runNativeHiddenDesktopGate(options = {}) {
  const execute = options.runCommand ?? runCommand;
  const logEvent = options.logEvent ?? appendDesktopHostTimelineEvent;
  const operationId = options.operationId ?? randomUUID();
  const record = (event, payload = {}) => {
    try {
      logEvent({ event, operationId, payload, source: 'hidden_native' });
    } catch (error) {
      process.stderr.write(`[desktop-native-hidden] timeline log failed: ${error.message}\n`);
    }
  };
  record('run_started', { skipBuild: shouldSkipBuild(options.env ?? process.env) });
  const buildCommands = createNativeHiddenDesktopBuildCommands(options);
  for (const buildCommand of buildCommands) {
    const code = await execute(buildCommand);
    if (code !== 0) {
      record('run_finished', { exitCode: code, stage: 'build' });
      return code;
    }
  }
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const appRoot = path.resolve(env.FOLIOLE_ELECTRON_APP_ROOT?.trim() || options.cwd || process.cwd());
  const runtime = platform === 'darwin'
    ? prepareMacosHiddenElectronRuntime({ appRoot, env })
    : null;
  try {
    record('electron_launch_started', { platform });
    const code = await execute(createNativeHiddenDesktopGateCommand({
      ...options,
      env: runtime ? { ...env, FOLIOLE_ELECTRON_EXECUTABLE_PATH: runtime.executablePath } : env
    }));
    record('run_finished', { exitCode: code, stage: 'electron' });
    return code;
  } finally {
    runtime?.cleanup();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await runNativeHiddenDesktopGate();
}
