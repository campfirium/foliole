/* global console, process, setTimeout */

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SITE_ROOT = process.env.FOLIOLE_SITE_ROOT || path.resolve(REPO_ROOT, '..', 'foliole-site');
const SITE_PREVIEW_URL = process.env.FOLIOLE_SITE_PREVIEW_URL || 'http://127.0.0.1:4321/demo/';
const STALE_COPY_PATTERNS = ['继续到 Day', '清空本地数据', 'Day 0 已清空'];

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function astroCommand() {
  return process.platform === 'win32'
    ? path.join(SITE_ROOT, 'node_modules', '.bin', 'astro.cmd')
    : path.join(SITE_ROOT, 'node_modules', '.bin', 'astro');
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === 'win32',
      stdio: 'inherit',
      windowsHide: true
    });
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} ${args.join(' ')} stopped by ${signal}`));
        return;
      }
      if (code) {
        reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
        return;
      }
      resolve();
    });
  });
}

function walkFiles(root, files = []) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
      continue;
    }
    if (/\.(html|js)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function assertNoStaleCopy() {
  const distRoot = path.join(SITE_ROOT, 'dist');
  const hits = [];
  for (const filePath of walkFiles(distRoot)) {
    const content = readFileSync(filePath, 'utf8');
    for (const pattern of STALE_COPY_PATTERNS) {
      if (content.includes(pattern)) hits.push(`${path.relative(SITE_ROOT, filePath)}: ${pattern}`);
    }
  }
  if (hits.length > 0) {
    throw new Error(`stale Demo copy remains:\n${hits.join('\n')}`);
  }
}

function requestPreview() {
  return new Promise((resolve) => {
    const request = http.get(SITE_PREVIEW_URL, (response) => {
      response.resume();
      resolve(response.statusCode && response.statusCode >= 200 && response.statusCode < 500);
    });
    request.setTimeout(1500, () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

async function waitForPreview() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await requestPreview()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`site preview did not start at ${SITE_PREVIEW_URL}`);
}

async function ensurePreviewServer() {
  if (await requestPreview()) return;
  const command = astroCommand();
  if (!existsSync(command)) {
    throw new Error(`Astro executable not found: ${command}`);
  }
  spawn(command, ['preview', '--host', '127.0.0.1', '--port', '4321'], {
    cwd: SITE_ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  }).unref();
  await waitForPreview();
}

function openBrowser() {
  if (process.env.FOLIOLE_SITE_PREVIEW_NO_OPEN === '1') return;
  if (process.platform === 'win32') {
    spawn('cmd.exe', ['/c', 'start', '', SITE_PREVIEW_URL], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }).unref();
  }
}

if (!existsSync(SITE_ROOT)) {
  throw new Error(`Foliole site repo not found: ${SITE_ROOT}`);
}

await run(npmCommand(), ['run', 'demo:build'], REPO_ROOT);
await run(npmCommand(), ['run', 'demo:sync'], SITE_ROOT);
await run(npmCommand(), ['run', 'build'], SITE_ROOT);
assertNoStaleCopy();
await ensurePreviewServer();
openBrowser();
console.log(`[demo-site-preview] opened ${SITE_PREVIEW_URL}`);
