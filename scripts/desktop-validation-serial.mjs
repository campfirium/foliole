/* global process */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeSpawnCommand } from './lib/spawn-command.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_PREFIX = '[desktop-validation-serial]';
let activeChild = null;

function isWslEnvironment(env = process.env) {
  if (env.DESKTOP_VALIDATION_SERIAL_FORCE_WSL === '1') {
    return true;
  }
  if (env.DESKTOP_VALIDATION_SERIAL_FORCE_WSL === '0') {
    return false;
  }
  return Boolean(env.WSL_DISTRO_NAME || env.WSL_INTEROP);
}

export function resolveDefaultPreviewCommand(env = process.env) {
  return isWslEnvironment(env)
    ? ['npm', 'run', 'windows:preview']
    : ['npm', 'run', 'windows:preview:native'];
}

function resolveCommands() {
  const encoded = process.env.DESKTOP_VALIDATION_SERIAL_COMMANDS_JSON;
  if (encoded) {
    const commands = JSON.parse(encoded);
    if (!Array.isArray(commands) || commands.some((command) => !isCommandTuple(command))) {
      throw new Error('DESKTOP_VALIDATION_SERIAL_COMMANDS_JSON must be a JSON array of command arrays.');
    }
    return commands;
  }

  return [
    ['npm', 'run', 'lint:desktop'],
    resolveDefaultPreviewCommand()
  ];
}

function isCommandTuple(command) {
  return Array.isArray(command) && command.length > 0 && command.every((part) => typeof part === 'string');
}

function runCommand(command, env) {
  return new Promise((resolve) => {
    const { args, bin } = normalizeSpawnCommand(command);
    const child = spawn(bin, args, {
      cwd: REPO_ROOT,
      env,
      stdio: 'inherit'
    });
    activeChild = child;
    child.on('error', (error) => {
      process.stderr.write(`${LOG_PREFIX} command launch error: ${error.message}\n`);
      resolve(1);
    });
    child.on('close', (code, signal) => {
      if (activeChild === child) {
        activeChild = null;
      }
      resolve(signal ? 1 : code ?? 1);
    });
  });
}

async function runCommands(commands, env) {
  for (const command of commands) {
    const code = await runCommand(command, env);
    if (code !== 0) {
      return code;
    }
  }
  return 0;
}

export async function runDesktopValidationSerial() {
  return runCommands(resolveCommands(), process.env);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runDesktopValidationSerial()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`${LOG_PREFIX} ${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    });
}
