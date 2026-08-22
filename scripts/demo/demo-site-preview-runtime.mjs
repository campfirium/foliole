/* global console, process, setTimeout */

import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { DEMO_SITE_PREVIEW_URL } from './demo-preview-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SITE_ROOT = process.env.FOLIOLE_SITE_ROOT || path.resolve(REPO_ROOT, '..', 'foliole-site');
const SITE_PREVIEW_URL = process.env.FOLIOLE_SITE_PREVIEW_URL || DEMO_SITE_PREVIEW_URL;
const SITE_PREVIEW_LOG_ROOT = path.join(REPO_ROOT, '.tmp', 'demo-site-preview');
const STALE_COPY_PATTERNS = ['继续到 Day', '清空本地数据', 'Day 0 已清空'];
const previewUrl = new URL(SITE_PREVIEW_URL);

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function astroCommand() {
  return path.join(SITE_ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs');
}

function previewLogPaths() {
  return {
    errLog: path.join(SITE_PREVIEW_LOG_ROOT, 'astro-preview.err.log'),
    outLog: path.join(SITE_PREVIEW_LOG_ROOT, 'astro-preview.out.log')
  };
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

function isPreviewPortAvailable() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(Number(previewUrl.port || '80'), previewUrl.hostname);
  });
}

function listeningPreviewPids() {
  if (process.platform !== 'win32') return [];
  const result = spawnSync('netstat.exe', ['-ano', '-p', 'tcp'], {
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) return [];
  const port = previewUrl.port || '80';
  const pids = new Set();
  for (const line of result.stdout.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 5 || columns[0] !== 'TCP') continue;
    const [localAddress, , state, pid] = columns.slice(1);
    if (state !== 'LISTENING') continue;
    if (!localAddress.endsWith(`:${port}`)) continue;
    pids.add(pid);
  }
  return [...pids];
}

async function releasePreviewPort() {
  const pids = listeningPreviewPids();
  if (pids.length === 0) return false;
  for (const pid of pids) {
    console.log(`[demo-site-preview] stopping stale preview port owner pid=${pid}`);
    spawnSync('taskkill.exe', ['/PID', pid, '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
  }
  return true;
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
  if (!(await isPreviewPortAvailable())) {
    await releasePreviewPort();
  }
  if (!(await isPreviewPortAvailable())) {
    throw new Error(`site preview port is occupied and could not be released for ${SITE_PREVIEW_URL}`);
  }
  const command = astroCommand();
  if (!existsSync(command)) {
    throw new Error(`Astro executable not found: ${command}`);
  }
  const logs = previewLogPaths();
  mkdirSync(SITE_PREVIEW_LOG_ROOT, { recursive: true });
  const out = openSync(logs.outLog, 'a');
  const err = openSync(logs.errLog, 'a');
  spawn(process.execPath, [command, 'preview', '--host', previewUrl.hostname, '--port', previewUrl.port || '80'], {
    cwd: SITE_ROOT,
    detached: true,
    shell: false,
    stdio: ['ignore', out, err],
    windowsHide: true
  }).unref();
  closeSync(out);
  closeSync(err);
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

export async function runDemoSitePreview() {
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
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDemoSitePreview().catch((error) => {
    console.error(`[demo-site-preview] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
