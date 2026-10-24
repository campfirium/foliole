#!/usr/bin/env node
/* global process */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// `device` is a library copied by `macos-a5-dev.mjs preview-pull`; `empty` is created on first open.
export const COMPANION_PREVIEW_DATA_SOURCES = ['device', 'empty'];

// Each data source keeps its own preview library under the rebuildable root cache.
export function companionPreviewDatabaseFile(root, data) {
  return path.join(root, '.cache', 'companion-preview', data, 'foliole-companionSQLite.db');
}

export function parseWebDevArgs(argv) {
  const index = argv.indexOf('--data');
  const data = index >= 0 ? argv[index + 1] : 'device';
  if (!COMPANION_PREVIEW_DATA_SOURCES.includes(data)) {
    throw new Error(`--data must be one of: ${COMPANION_PREVIEW_DATA_SOURCES.join(', ')}`);
  }
  return { data };
}

export function createWebDevLaunch({
  data = 'device',
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
      env: {
        ...process.env,
        FOLIOLE_COMPANION_PREVIEW_DB: companionPreviewDatabaseFile(root, data),
        FOLIOLE_VITE_HMR: '1',
        FOLIOLE_VITE_PORT: String(port)
      },
      shell: false,
      stdio: 'inherit'
    }
  };
}

export function runAndroidWebDev(options = {}) {
  const launch = createWebDevLaunch(options);
  const database = launch.options.env.FOLIOLE_COMPANION_PREVIEW_DB;
  if (options.data !== 'empty' && !existsSync(database)) {
    throw new Error('No device preview library. Run `node scripts/android/macos-a5-dev.mjs preview-pull` '
      + 'first, or start with `--data empty`.');
  }
  mkdirSync(path.dirname(database), { recursive: true });
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
  process.exitCode = await runAndroidWebDev(parseWebDevArgs(process.argv.slice(2)));
}
