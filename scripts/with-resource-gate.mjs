#!/usr/bin/env node
/* global process */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { withResourceGate } from './lib/resource-gate.mjs';

const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(process.env.FOLIOLE_RESOURCE_GATE_REPO_ROOT ?? process.cwd() ?? DEFAULT_REPO_ROOT);
let activeChild = null;

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
    const [rawBin, ...args] = command;
    const bin = rawBin === 'npm' && process.platform === 'win32' ? 'npm.cmd' : rawBin;
    const child = spawn(bin, args, {
      cwd: REPO_ROOT,
      env,
      shell: false,
      stdio: 'inherit'
    });
    activeChild = child;
    child.on('error', (error) => {
      process.stderr.write(`[validation-resource-gate] command launch ${error.message}\n`);
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
