#!/usr/bin/env node
/* global clearTimeout, process, setTimeout */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { withResourceGate } from './lib/resource-gate.mjs';
import { normalizeSpawnCommand } from './lib/spawn-command.mjs';
import { killPid } from './windows/windows-client-native-process.mjs';

const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_COMMAND_TIMEOUT_MS = 15 * 60_000;
const REPO_ROOT = path.resolve(process.env.FOLIOLE_RESOURCE_GATE_REPO_ROOT ?? process.cwd() ?? DEFAULT_REPO_ROOT);
let activeChild = null;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv) {
  const separatorIndex = argv.indexOf('--');
  const className = argv[0];
  const command = separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1);
  if (!className || command.length === 0) {
    throw new Error('Usage: node scripts/with-resource-gate.mjs <node-heavy|preview|exclusive> -- <command...>');
  }
  return { className, command };
}

function runCommand(command, env) {
  return new Promise((resolve) => {
    const { args, bin } = normalizeSpawnCommand(command);
    let settled = false;
    let timedOut = false;
    let timeout = null;
    const finish = (code) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      resolve(code);
    };
    const child = spawn(bin, args, {
      cwd: REPO_ROOT,
      env,
      shell: false,
      stdio: 'inherit'
    });
    activeChild = child;
    const timeoutMs = parsePositiveInt(env.FOLIOLE_RESOURCE_GATE_COMMAND_TIMEOUT_MS, DEFAULT_COMMAND_TIMEOUT_MS);
    timeout = setTimeout(() => {
      timedOut = true;
      process.stdout.write(`[validation-resource-gate] command timed out after ${timeoutMs}ms; terminating pid=${child.pid ?? 'unknown'}\n`);
      if (!child.pid) {
        finish(1);
        return;
      }
      killPid(child.pid)
        .then(() => {
          finish(1);
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          process.stderr.write(`[validation-resource-gate] command cleanup failed ${message}\n`);
          finish(1);
        });
    }, timeoutMs);
    timeout.unref?.();
    child.on('error', (error) => {
      process.stderr.write(`[validation-resource-gate] command launch ${error.message}\n`);
      finish(1);
    });
    child.on('close', (code, signal) => {
      if (activeChild === child) {
        activeChild = null;
      }
      finish(timedOut ? 1 : signal ? 1 : code ?? 1);
    });
  });
}

function stopActiveChild(signal) {
  if (!activeChild || activeChild.exitCode !== null || activeChild.signalCode !== null) {
    return;
  }
  activeChild.kill(signal);
}

async function main() {
  const { className, command } = parseArgs(process.argv.slice(2));
  return withResourceGate({
    className,
    commandLabel: command.join(' '),
    fn: (env) => runCommand(command, env),
    onSignal: stopActiveChild,
    repoRoot: REPO_ROOT
  });
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`[validation-resource-gate] ${error.message}\n`);
    process.exitCode = 1;
  });
