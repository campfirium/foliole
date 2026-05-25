/* global process */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatGateQueueMessage, withResourceGate } from './lib/resource-gate.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_PREFIX = '[desktop-validation-serial]';
let activeChild = null;

export function formatQueueActiveMessage({ ageSeconds, pid }) {
  return formatGateQueueMessage({
    className: 'preview',
    holderPid: pid,
    resource: 'preview',
    seconds: ageSeconds
  });
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

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return [
    [npmCommand, 'run', 'lint:desktop'],
    [npmCommand, 'run', 'windows:preview:native']
  ];
}

function isCommandTuple(command) {
  return Array.isArray(command) && command.length > 0 && command.every((part) => typeof part === 'string');
}

function stopActiveChild(signal) {
  if (!activeChild || activeChild.exitCode !== null || activeChild.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = globalThis.setTimeout(resolve, 1_000);
    activeChild.once('close', () => {
      globalThis.clearTimeout(timer);
      resolve();
    });
    activeChild.kill(signal);
  });
}

function runCommand(command, env) {
  return new Promise((resolve) => {
    const [bin, ...args] = command;
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
  return withResourceGate({
    className: 'preview',
    commandLabel: 'validate:desktop:serial',
    fn: (env) => runCommands(resolveCommands(), env),
    onSignal: stopActiveChild,
    repoRoot: REPO_ROOT
  });
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
