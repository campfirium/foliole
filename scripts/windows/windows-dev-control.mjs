#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const COMMIT_SHA = /^[0-9a-f]{40}$/u;
export const WINDOWS_DEV_SOURCE_REF = 'refs/heads/dev';

function execute(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0
      ? resolve(stdout)
      : reject(new Error(stderr.trim() || `${command} exited ${code}`)));
  });
}

export function parseWindowsDevControlArgs(argv, env = process.env) {
  const args = [...argv];
  const hostIndex = args.indexOf('--host');
  const host = hostIndex >= 0 ? args.splice(hostIndex, 2)[1] : env.FOLIOLE_WINDOWS_DEV_SSH;
  if (!host || !/^[A-Za-z0-9._\\-]+@[A-Za-z0-9.-]+$/u.test(host)) {
    throw new Error('--host user@host or FOLIOLE_WINDOWS_DEV_SSH is required');
  }
  if (args.length !== 1 || args[0] !== 'push') throw new Error('Windows DEV control only accepts push');
  return { host };
}

export function windowsDevPushSpec(host, commitSha, env = process.env, home = os.homedir()) {
  const key = env.FOLIOLE_WINDOWS_DEV_GIT_SSH_KEY
    || path.join(home, '.ssh', 'agent', 'foliole-windows-android-lab-git');
  if (/['\0\r\n]/u.test(key)) throw new Error('Windows DEV Git key path contains unsupported characters');
  return {
    args: ['push', '--porcelain', `${host}:foliole-dev.git`, `${commitSha}:${WINDOWS_DEV_SOURCE_REF}`],
    env: {
      ...env,
      GIT_SSH_COMMAND: `ssh -i '${key}' -o BatchMode=yes -o IdentitiesOnly=yes `
        + '-o ConnectTimeout=15 -o StrictHostKeyChecking=yes'
    }
  };
}

export async function runWindowsDevControl({
  argv = process.argv.slice(2), env = process.env,
  executeGit = (args, options) => execute('git', args, options), stdout = process.stdout
} = {}) {
  const { host } = parseWindowsDevControlArgs(argv, env);
  const branch = String(await executeGit(['branch', '--show-current'], { env })).trim();
  if (branch !== 'dev') throw new Error('Windows DEV source push requires the dev branch');
  const commitSha = String(await executeGit(['rev-parse', '--verify', 'HEAD'], { env })).trim();
  if (!COMMIT_SHA.test(commitSha)) throw new Error('Windows DEV source commit is invalid');
  const spec = windowsDevPushSpec(host, commitSha, env);
  await executeGit(spec.args, { env: spec.env });
  const result = { commitSha, operation: 'push', ref: WINDOWS_DEV_SOURCE_REF, schemaVersion: 1 };
  stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runWindowsDevControl().catch((error) => {
    console.error(`[windows-dev-control] ${error.message}`);
    process.exitCode = 1;
  });
}
