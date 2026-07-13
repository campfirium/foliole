#!/usr/bin/env node
/* global process */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function createWebDevLaunch({
  host = '127.0.0.1',
  nodePath = process.execPath,
  port = 24604,
  root = repoRoot
} = {}) {
  return {
    args: ['node_modules/vite/bin/vite.js', '--config', 'vite.companion.config.ts', '--host', host],
    command: nodePath,
    options: {
      cwd: root,
      env: { ...process.env, FOLIOLE_VITE_PORT: String(port) },
      shell: false,
      stdio: 'inherit'
    }
  };
}

export function runAndroidWebDev(options = {}) {
  const launch = createWebDevLaunch(options);
  return new Promise((resolve, reject) => {
    const child = spawn(launch.command, launch.args, launch.options);
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runAndroidWebDev();
}
