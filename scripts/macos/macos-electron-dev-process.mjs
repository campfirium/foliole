/* global clearTimeout, process, setTimeout */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export async function createMacosElectronDevLogger(logFile) {
  await mkdir(path.dirname(logFile), { recursive: true });
  const file = fs.createWriteStream(logFile, { flags: 'a' });
  const write = (target, chunk) => {
    const value = String(chunk);
    file.write(value);
    target.write(value);
  };
  return {
    close: () => new Promise((resolve) => file.end(resolve)),
    event(name, detail = '') {
      const suffix = detail ? ` ${detail}` : '';
      write(process.stdout, `[macos-electron-dev] ${name}${suffix}\n`);
    },
    stderr: (chunk) => write(process.stderr, chunk),
    stdout: (chunk) => write(process.stdout, chunk)
  };
}

export function spawnLoggedChild(bin, args, { cwd, env, logger, detached = false }) {
  const child = spawn(bin, args, {
    cwd,
    detached,
    env,
    shell: false,
    stdio: ['inherit', 'pipe', 'pipe']
  });
  child.stdout.on('data', logger.stdout);
  child.stderr.on('data', logger.stderr);
  const closed = new Promise((resolve) => {
    let spawnError = null;
    child.on('error', (error) => { spawnError = error; });
    child.on('close', (code, signal) => resolve({ code: code ?? 1, error: spawnError, signal }));
  });
  return { child, closed };
}

export async function runLoggedCommand(bin, args, options) {
  const { closed } = spawnLoggedChild(bin, args, options);
  const result = await closed;
  return result.code === 0 && !result.signal;
}

export async function stopLoggedChild(active, timeoutMs = 5000) {
  if (!active) return;
  const { child, closed } = active;
  const signalGroup = (signal) => {
    if (!child.pid) return;
    try { process.kill(-child.pid, signal); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  const waitForClose = async () => {
    let timer;
    try {
      return await Promise.race([
        closed.then(() => true),
        new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); })
      ]);
    } finally { clearTimeout(timer); }
  };
  if (child.pid && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  if (await waitForClose()) return;
  signalGroup('SIGTERM');
  if (await waitForClose()) return;
  signalGroup('SIGKILL');
  if (!await waitForClose()) throw new Error(`DEV child group did not close pid=${child.pid}`);
}
