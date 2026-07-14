/* global process */

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

export function spawnLoggedChild(bin, args, { cwd, env, logger }) {
  const child = spawn(bin, args, {
    cwd,
    env,
    shell: false,
    stdio: ['inherit', 'pipe', 'pipe']
  });
  child.stdout.on('data', logger.stdout);
  child.stderr.on('data', logger.stderr);
  const closed = new Promise((resolve) => {
    child.on('error', (error) => resolve({ code: 1, error, signal: null }));
    child.on('exit', (code, signal) => resolve({ code: code ?? 1, error: null, signal }));
  });
  return { child, closed };
}

export async function runLoggedCommand(bin, args, options) {
  const { closed } = spawnLoggedChild(bin, args, options);
  const result = await closed;
  return result.code === 0 && !result.signal;
}
