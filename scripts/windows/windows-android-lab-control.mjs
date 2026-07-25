#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { WINDOWS_ANDROID_LAB_SOURCE_REF } from './windows-android-lab-state.mjs';

export function remoteAndroidLabPaths(env, home = os.homedir()) {
  return {
    gitSshKey: env.FOLIOLE_WINDOWS_ANDROID_LAB_GIT_SSH_KEY || path.join(home, '.ssh', 'agent', 'foliole-windows-android-lab-git'),
    sshKey: env.FOLIOLE_WINDOWS_ANDROID_LAB_SSH_KEY || path.join(home, '.ssh', 'agent', 'foliole-windows-android-lab')
  };
}

export function parseAndroidLabControlArgs(argv, env) {
  const args = [...argv];
  const hostIndex = args.indexOf('--host');
  const host = hostIndex >= 0 ? args.splice(hostIndex, 2)[1] : env.FOLIOLE_WINDOWS_ANDROID_LAB_SSH;
  if (!host || !/^[A-Za-z0-9._\\-]+@[A-Za-z0-9.-]+$/u.test(host)) {
    throw new Error('--host user@host or FOLIOLE_WINDOWS_ANDROID_LAB_SSH is required');
  }
  const outputIndex = args.indexOf('--output');
  const output = outputIndex >= 0 ? args.splice(outputIndex, 2)[1] : null;
  if (!args[0]) throw new Error('Android lab action is required');
  return { command: args, host, output };
}

function ssh(host, command, env) {
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', androidLabSshArgs(host, command, env), {
      shell: false, stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout = [];
    let stderr = '';
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(Buffer.concat(stdout)) : reject(new Error(stderr.trim() || `ssh exited ${code}`)));
  });
}

function git(args, { env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    let stderr = '';
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(Buffer.concat(stdout)) : reject(new Error(stderr.trim() || `git exited ${code}`)));
  });
}

export function androidLabSshArgs(host, command, env, home = os.homedir()) {
  const remote = remoteAndroidLabPaths(env, home);
  return [
    '-T', '-i', remote.sshKey, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', host, ...command
  ];
}

export function androidLabGitPushSpec(host, commitSha, env, home = os.homedir()) {
  const key = remoteAndroidLabPaths(env, home).gitSshKey;
  if (!/^[A-Za-z0-9_./-]+$/u.test(key)) throw new Error('Android Lab Git SSH key path contains unsupported characters');
  return {
    args: ['push', '--porcelain', `${host}:foliole-android-lab.git`, `${commitSha}:${WINDOWS_ANDROID_LAB_SOURCE_REF}`],
    env: {
      ...env,
      GIT_SSH_COMMAND: `ssh -i ${key} -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=yes`
    }
  };
}

async function pushAndroidLabSource(host, env, executeGit) {
  const status = String(await executeGit(['status', '--porcelain'], { env })).trim();
  if (status) throw new Error('Android Lab source push requires a clean working tree');
  const branch = String(await executeGit(['branch', '--show-current'], { env })).trim();
  if (branch !== 'dev') throw new Error('Android Lab source push requires the dev branch');
  const commitSha = String(await executeGit(['rev-parse', '--verify', 'HEAD'], { env })).trim();
  if (!/^[0-9a-f]{40}$/u.test(commitSha)) throw new Error('Android Lab source commit is invalid');
  const spec = androidLabGitPushSpec(host, commitSha, env);
  await executeGit(spec.args, { env: spec.env });
  return { commitSha, ref: WINDOWS_ANDROID_LAB_SOURCE_REF, schemaVersion: 1 };
}

export async function runWindowsAndroidLabControl({
  argv = process.argv.slice(2), env = process.env, executeGit = git, stdout = process.stdout
} = {}) {
  const { command, host, output } = parseAndroidLabControlArgs(argv, env);
  if (command[0] === 'push') {
    if (command.length !== 1 || output) throw new Error('push does not accept remote arguments or --output');
    const pushed = await pushAndroidLabSource(host, env, executeGit);
    stdout.write(`${JSON.stringify(pushed)}\n`);
    return pushed;
  }
  const result = await ssh(host, command, env);
  if (output) {
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(output, result);
    return { output: path.resolve(output) };
  }
  stdout.write(result);
  if (result.length > 0 && result.at(-1) !== 10) stdout.write('\n');
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runWindowsAndroidLabControl().catch((error) => {
    console.error(`[windows-android-lab-control] ${error.message}`);
    process.exitCode = 1;
  });
}
