#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { maintainBeforeProduction } from '../diagnostics/local-artifact-cache-production.mjs';

const executeFile = promisify(execFile);
const CDP = 'http://127.0.0.1:19224';
const LAUNCHER = 'scripts/acceptance/launch-isolated-desktop.mjs';

async function execute(command, args, options = {}) {
  const result = await executeFile(command, args, { maxBuffer: 10 * 1024 * 1024, ...options });
  return result.stdout;
}

async function currentCandidate(repoRoot, run) {
  const branch = (await run('git', ['branch', '--show-current'], { cwd: repoRoot })).trim();
  const dirty = (await run('git', ['status', '--short'], { cwd: repoRoot })).trim();
  const revision = (await run('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })).trim();
  if (branch !== 'sync') throw new Error(`expected sync branch, got ${branch || 'detached'}`);
  if (dirty) throw new Error('sync worktree must be committed before opening Mac');
  if (!/^[0-9a-f]{40}$/u.test(revision)) throw new Error('sync revision is invalid');
  return revision;
}

function startDetached(command, args, { cwd, logPath }) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const output = fs.openSync(logPath, 'a');
  try {
    const child = spawn(command, args, {
      cwd, detached: true, stdio: ['ignore', output, output]
    });
    child.unref();
    return child.pid;
  } finally {
    fs.closeSync(output);
  }
}

function processAlive(pid, signal = process.kill) {
  try {
    signal(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function stopExistingMacClient({
  repoRoot, run = execute, signal = process.kill, alive = processAlive,
  wait = (ms) => delay(ms)
}) {
  let listenerOutput;
  try {
    listenerOutput = await run('lsof', ['-nP', '-iTCP:19224', '-sTCP:LISTEN', '-t']);
  } catch (error) {
    if (error?.code === 1) return;
    throw error;
  }
  const listeners = [...new Set(listenerOutput.trim().split(/\s+/u).filter(Boolean))];
  if (listeners.length !== 1 || !/^\d+$/u.test(listeners[0])) {
    throw new Error('Mac CDP port must have exactly one owning process');
  }
  const mainPid = Number(listeners[0]);
  const mainFacts = (await run('ps', ['-p', String(mainPid), '-o', 'ppid=,command='])).trim();
  const match = /^(\d+)\s+([\s\S]+)$/u.exec(mainFacts);
  if (!match) throw new Error('Mac CDP owner facts are unavailable');
  const managerPid = Number(match[1]);
  const mainCommand = match[2];
  const executable = path.join(repoRoot, 'node_modules', 'electron', 'dist',
    'Electron.app', 'Contents', 'MacOS', 'Electron');
  const mainEntry = path.join(repoRoot, 'dist', 'electron', 'main.js');
  const managerCommand = (await run('ps', ['-p', String(managerPid), '-o', 'command='])).trim();
  const artifactPrefix = path.join(repoRoot, '.tmp', 'artifacts');
  if (!mainCommand.startsWith(executable) || !mainCommand.includes(mainEntry) ||
      !managerCommand.includes(LAUNCHER) || !managerCommand.includes(artifactPrefix) ||
      !managerCommand.includes('--cdp-port 19224')) {
    throw new Error('Mac CDP port is not owned by this checkout isolated client');
  }
  signal(managerPid, 'SIGTERM');
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (!alive(managerPid, signal) && !alive(mainPid, signal)) return;
    await wait(100);
  }
  throw new Error('existing Mac client did not close within 10 seconds');
}

async function waitForCdp(fetchApi, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetchApi(`${CDP}/json/version`, {
        signal: globalThis.AbortSignal.timeout(2_000)
      });
      if (response.ok) return response.json();
    } catch { /* The client is still starting. */ }
    await delay(500);
  }
  throw new Error('Mac client did not become controllable within 120 seconds');
}

export async function openMacSyncClient({
  repoRoot = process.cwd(), run = execute, launch = startDetached,
  stop = stopExistingMacClient, fetchApi = globalThis.fetch,
  maintain = maintainBeforeProduction
} = {}) {
  const revision = await currentCandidate(repoRoot, run);
  await run('npm', ['run', 'build'], { cwd: repoRoot });
  await run('npm', ['run', 'electron:compile'], { cwd: repoRoot });
  await stop({ repoRoot });
  maintain({ rootDir: repoRoot });
  const artifactRoot = path.join(repoRoot, '.tmp', 'artifacts', 'client-control-runtime',
    `mac-${revision.slice(0, 10)}`);
  const stateRoot = path.join(artifactRoot, 'state');
  const resultPath = path.join(artifactRoot, 'launch.json');
  const logPath = path.join(repoRoot, '.tmp', 'artifacts', 'client-control-processes',
    `mac-${revision.slice(0, 10)}.log`);
  const pid = launch(process.execPath, [LAUNCHER,
    '--artifact-root', artifactRoot, '--state-root', stateRoot,
    '--result', resultPath, '--revision', revision, '--cdp-port', '19224'
  ], { cwd: repoRoot, logPath });
  const cdp = await waitForCdp(fetchApi);
  return { browser: cdp.Browser, cdp: CDP, logPath, pid, revision };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  openMacSyncClient().then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`[open-mac-sync-client] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
