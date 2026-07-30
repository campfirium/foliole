#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const WINDOWS_DEV_SOURCE_REF = 'refs/heads/dev';
export const WINDOWS_DEV_ACTIONS = ['build', 'deploy', 'live', 'verify'];
const WINDOWS_DEV_REMOTE_ACTION = 'C:/dev/foliole-android-lab-preview/scripts/windows/windows-dev-action.ps1';
const WINDOWS_DEV_EVIDENCE_PREFIX = 'C:/dev/foliole-android-lab-preview/.tmp/artifacts/windows-dev-action/';

function execute(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve(stdout);
      const error = new Error(stderr.trim() || `${command} exited ${code}`);
      error.output = `${stdout}${stderr}`;
      reject(error);
    });
  });
}

export function parseWindowsDevControlArgs(argv, env = process.env) {
  const args = [...argv];
  const hostIndex = args.indexOf('--host');
  const host = hostIndex >= 0 ? args.splice(hostIndex, 2)[1] : env.FOLIOLE_WINDOWS_DEV_SSH;
  if (!host || !/^[A-Za-z0-9._\\-]+@[A-Za-z0-9.-]+$/u.test(host)) {
    throw new Error('--host user@host or FOLIOLE_WINDOWS_DEV_SSH is required');
  }
  if (args.length !== 1 || !WINDOWS_DEV_ACTIONS.includes(args[0])) {
    throw new Error('Windows DEV control only accepts build, deploy, live, or verify');
  }
  return { action: args[0], host };
}

export function windowsDevPushSpec(host, env = process.env, home = os.homedir()) {
  const key = env.FOLIOLE_WINDOWS_DEV_GIT_SSH_KEY
    || path.join(home, '.ssh', 'agent', 'foliole-windows-android-lab-git');
  if (/['\0\r\n]/u.test(key)) throw new Error('Windows DEV Git key path contains unsupported characters');
  return {
    args: ['push', '--porcelain', `${host}:foliole-dev.git`, `dev:${WINDOWS_DEV_SOURCE_REF}`],
    env: {
      ...env,
      GIT_SSH_COMMAND: `ssh -i '${key}' -o BatchMode=yes -o IdentitiesOnly=yes `
        + '-o ConnectTimeout=15 -o StrictHostKeyChecking=yes'
    }
  };
}

export function windowsDevSshSpec(host, action, env = process.env, home = os.homedir()) {
  const key = env.FOLIOLE_WINDOWS_DEV_SSH_KEY
    || path.join(home, '.ssh', 'agent', 'foliole-windows-android-lab');
  return ['-T', '-i', key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', host,
    'powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', WINDOWS_DEV_REMOTE_ACTION, action];
}

export function parseWindowsDevLiveEvidence(output) {
  const match = /^\[windows-dev-action\] live identity=([A-Za-z0-9.-]{1,96}) screenshot=([^\r\n]+)$/mu.exec(output);
  if (!match) throw new Error('Windows DEV live action did not report screenshot evidence');
  const normalized = match[2].replaceAll('\\', '/');
  const expected = `${WINDOWS_DEV_EVIDENCE_PREFIX}${match[1]}/a5-live.png`;
  if (normalized !== expected) throw new Error('Windows DEV live screenshot path escaped its fixed evidence root');
  return { buildIdentity: match[1], remotePath: normalized };
}

export function windowsDevScpSpec(host, remotePath, localPath, env = process.env, home = os.homedir()) {
  const key = env.FOLIOLE_WINDOWS_DEV_SSH_KEY
    || path.join(home, '.ssh', 'agent', 'foliole-windows-android-lab');
  return ['-q', '-i', key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes',
    `${host}:${remotePath}`, localPath];
}

export async function runWindowsDevControl({
  argv = process.argv.slice(2), env = process.env,
  executeGit = (args, options) => execute('git', args, options),
  executeScp = (args, options) => execute('scp', args, options),
  executeSsh = (args, options) => execute('ssh', args, options), fsApi = fs,
  repoRoot = process.cwd(), stdout = process.stdout
} = {}) {
  const { action, host } = parseWindowsDevControlArgs(argv, env);
  const spec = windowsDevPushSpec(host, env);
  await executeGit(spec.args, { env: spec.env });
  let remoteError = null;
  let remoteOutput = '';
  try {
    remoteOutput = await executeSsh(windowsDevSshSpec(host, action, env), { env });
  } catch (error) {
    remoteError = error;
    remoteOutput = error.output || error.message;
  }
  if (remoteOutput && !remoteError) stdout.write(remoteOutput);
  const result = { action, operation: 'complete', ref: WINDOWS_DEV_SOURCE_REF };
  if (['deploy', 'live'].includes(action)) {
    const evidence = parseWindowsDevLiveEvidence(remoteOutput);
    const evidenceRoot = path.join(repoRoot, '.tmp', 'artifacts', 'a5-live-reload');
    fsApi.mkdirSync(evidenceRoot, { recursive: true });
    const screenshotPath = path.join(evidenceRoot, `${evidence.buildIdentity}.png`);
    await executeScp(windowsDevScpSpec(host, evidence.remotePath, screenshotPath, env), { env });
    result.screenshotPath = screenshotPath;
  }
  if (remoteError) throw remoteError;
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runWindowsDevControl().catch((error) => {
    console.error(`[windows-dev-control] ${error.message}`);
    process.exitCode = 1;
  });
}
