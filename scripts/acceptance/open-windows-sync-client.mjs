#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const executeFile = promisify(execFile);
const CONTROL = 'scripts/acceptance/windows-sync-client-control.mjs';
const CDP = 'http://127.0.0.1:19222/json/version';
const GIT_HOST = 'zephu@192.168.0.11:foliole-dev.git';
const PORT = '9222';

async function execute(command, args, options = {}) {
  const result = await executeFile(command, args, { maxBuffer: 10 * 1024 * 1024, ...options });
  return result.stdout;
}

async function currentCandidate(repoRoot, run) {
  const branch = (await run('git', ['branch', '--show-current'], { cwd: repoRoot })).trim();
  const dirty = (await run('git', ['status', '--short'], { cwd: repoRoot })).trim();
  const revision = (await run('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })).trim();
  if (branch !== 'sync') throw new Error(`expected sync branch, got ${branch || 'detached'}`);
  if (dirty) throw new Error('sync worktree must be committed before opening Windows');
  if (!/^[0-9a-f]{40}$/u.test(revision)) throw new Error('sync revision is invalid');
  return revision;
}

function startDetached(command, args, { cwd, logPath }) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const output = fs.openSync(logPath, 'a');
  const child = spawn(command, args, {
    cwd, detached: true, stdio: ['ignore', output, output]
  });
  child.unref();
  fs.closeSync(output);
  return child.pid;
}

async function waitForCdp(fetchApi, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetchApi(CDP, { signal: globalThis.AbortSignal.timeout(2_000) });
      if (response.ok) return response.json();
    } catch { /* The client is still starting. */ }
    await delay(500);
  }
  throw new Error('Windows client did not become controllable within 120 seconds');
}

export async function openWindowsSyncClient({
  repoRoot = process.cwd(), run = execute, launch = startDetached, fetchApi = globalThis.fetch
} = {}) {
  const revision = await currentCandidate(repoRoot, run);
  const gitKey = path.join(os.homedir(), '.ssh', 'agent', 'foliole-windows-android-lab-git');
  await run('git', ['push', '--no-verify', '--porcelain', GIT_HOST,
    `sync:refs/heads/sync`], { cwd: repoRoot, env: {
      ...process.env,
      GIT_SSH_COMMAND: `ssh -i '${gitKey}' -o BatchMode=yes -o IdentitiesOnly=yes `
        + '-o ConnectTimeout=15 -o StrictHostKeyChecking=yes'
    } });
  await run(process.execPath, [CONTROL, 'align', '--revision', revision], { cwd: repoRoot });
  await run(process.execPath, [CONTROL, 'stop', '--port', PORT], { cwd: repoRoot });
  const logPath = path.join(repoRoot, '.tmp', 'artifacts', 'client-control-processes',
    `windows-${revision.slice(0, 10)}.log`);
  const pid = launch(process.execPath, [CONTROL, 'start', '--revision', revision,
    '--instance', 'a', '--port', PORT], { cwd: repoRoot, logPath });
  const cdp = await waitForCdp(fetchApi);
  return { cdp: 'http://127.0.0.1:19222', logPath, pid, revision,
    browser: cdp.Browser };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  openWindowsSyncClient().then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`[open-windows-sync-client] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
