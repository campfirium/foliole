#!/usr/bin/env node
/* global process */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEMO_PREVIEW_HOST = '127.0.0.1';
export const DEMO_PREVIEW_PORT = 43077;
export const DEMO_PREVIEW_PATH = '/en/demo/';
export const DEMO_PREVIEW_URL =
  `http://${DEMO_PREVIEW_HOST}:${DEMO_PREVIEW_PORT}${DEMO_PREVIEW_PATH}`;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function createDemoPreviewLaunch({
  host = DEMO_PREVIEW_HOST,
  nodePath = process.execPath,
  port = DEMO_PREVIEW_PORT,
  root = repoRoot
} = {}) {
  return {
    args: [
      'node_modules/vite/bin/vite.js', '--config', 'vite.demo.config.ts',
      '--host', host, '--port', String(port), '--strictPort'
    ],
    command: nodePath,
    options: { cwd: root, shell: false, stdio: 'inherit' }
  };
}

export function runDemoPreview(options = {}) {
  const launch = createDemoPreviewLaunch(options);
  process.stdout.write(`[demo-preview] url=${DEMO_PREVIEW_URL}\n`);
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
  process.exitCode = await runDemoPreview();
}
