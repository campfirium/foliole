#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  WINDOWS_ANDROID_LAB_PROTOCOL_VERSION, WINDOWS_ANDROID_LAB_SOURCE_REF
} from './windows-android-lab-state.mjs';
import { loadAndroidLabEnvelope } from './windows-android-lab-request.mjs';

const COMMIT_SHA = /^[0-9a-f]{40}$/u;

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

function ssh(host, command, env, input = null) {
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', androidLabSshArgs(host, command, env), {
      shell: false, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe']
    });
    const stdout = [];
    let stderr = '';
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(Buffer.concat(stdout)) : reject(new Error(stderr.trim() || `ssh exited ${code}`)));
    if (input) child.stdin.end(input);
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
    '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes',
    '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', host, ...command
  ];
}

export function androidLabGitPushSpec(host, commitSha, env, home = os.homedir()) {
  const key = remoteAndroidLabPaths(env, home).gitSshKey;
  return {
    args: ['push', '--porcelain', `${host}:foliole-android-lab.git`, `${commitSha}:${WINDOWS_ANDROID_LAB_SOURCE_REF}`],
    env: {
      ...env,
      GIT_SSH_COMMAND:
        `ssh -i ${quoteGitSshCommandToken(key)} ` +
        '-o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=yes'
    }
  };
}

function quoteGitSshCommandToken(value) {
  if (typeof value !== 'string' || value.length === 0 || /[\0\r\n']/u.test(value)) {
    throw new Error('Android Lab Git SSH key path contains unsupported characters');
  }
  return `'${value}'`;
}

export function androidLabSigningInstallSpec(filePath) {
  const resolved = path.resolve(filePath);
  const stat = fs.statSync(resolved);
  if (!stat.isFile() || stat.size < 1 || stat.size > 65_536) {
    throw new Error('Android debug keystore must be a 1..65536 byte regular file');
  }
  const input = fs.readFileSync(resolved);
  const sha256 = createHash('sha256').update(input).digest('hex');
  return { command: ['signing', 'install', String(input.length), sha256], input, sha256 };
}

async function pushAndroidLabSource(host, env, executeGit, explicitCommitSha = null) {
  if (!explicitCommitSha) {
    const status = String(await executeGit(['status', '--porcelain'], { env })).trim();
    if (status) throw new Error('Android Lab source push requires a clean working tree');
  }
  const branch = String(await executeGit(['branch', '--show-current'], { env })).trim();
  if (branch !== 'dev') throw new Error('Android Lab source push requires the dev branch');
  const commitSha = explicitCommitSha || String(await executeGit(['rev-parse', '--verify', 'HEAD'], { env })).trim();
  if (!COMMIT_SHA.test(commitSha)) throw new Error('Android Lab source commit is invalid');
  if (explicitCommitSha) {
    const verified = String(await executeGit(['rev-parse', '--verify', `${commitSha}^{commit}`], { env })).trim();
    if (verified !== commitSha) throw new Error('Android Lab source commit is invalid');
    await executeGit(['merge-base', '--is-ancestor', commitSha, 'HEAD'], { env });
  }
  const spec = androidLabGitPushSpec(host, commitSha, env);
  await executeGit(spec.args, { env: spec.env });
  return { commitSha, ref: WINDOWS_ANDROID_LAB_SOURCE_REF, schemaVersion: 1 };
}

function isRunScopedCollect(command) {
  return command[0] === 'collect'
    && ((command[1] === 'list' && command.length === 3) || (command[1] === 'get' && command.length === 4));
}

function requiresProtocolPreflight(command) {
  return ['request', 'review'].includes(command[0]) || isRunScopedCollect(command);
}

async function assertRunScopedCollectSupport(host, env, executeSsh) {
  const raw = await executeSsh(host, ['status'], env, null);
  let status;
  try {
    status = JSON.parse(String(raw));
  } catch {
    throw new Error('Windows Android Lab version could not be verified; reinstall the Lab before run-scoped collect');
  }
  if (status.protocolVersion !== WINDOWS_ANDROID_LAB_PROTOCOL_VERSION) {
    throw new Error('Windows Android Lab version mismatch; reinstall the Lab before run-scoped collect');
  }
}

export async function runWindowsAndroidLabControl({
  argv = process.argv.slice(2), env = process.env, executeGit = git, executeSsh = ssh, stdout = process.stdout
} = {}) {
  const { command, host, output } = parseAndroidLabControlArgs(argv, env);
  if (command[0] === 'push') {
    if (output) throw new Error('push does not accept --output');
    const explicitCommitSha = command.length === 3 && command[1] === '--commit' ? command[2] : null;
    if ((explicitCommitSha && !COMMIT_SHA.test(explicitCommitSha)) || (!explicitCommitSha && command.length !== 1)) {
      throw new Error('push accepts no arguments, or --commit <40-character commit SHA>');
    }
    const pushed = await pushAndroidLabSource(host, env, executeGit, explicitCommitSha);
    stdout.write(`${JSON.stringify(pushed)}\n`);
    return pushed;
  }
  let remoteCommand = command;
  let input = null;
  if (command[0] === 'request') {
    if (command.length !== 2 || output) throw new Error('request requires one local envelope JSON path and does not accept --output');
    const request = loadAndroidLabEnvelope(command[1]);
    remoteCommand = ['request', String(request.payload.length), request.sha256];
    input = request.payload;
  }
  if (command[0] === 'signing') {
    if (command.length !== 3 || command[1] !== 'install' || output) {
      throw new Error('signing requires install <local-keystore-path> and does not accept --output');
    }
    const spec = androidLabSigningInstallSpec(command[2]);
    remoteCommand = spec.command;
    input = spec.input;
  }
  if (requiresProtocolPreflight(remoteCommand)) await assertRunScopedCollectSupport(host, env, executeSsh);
  const result = await executeSsh(host, remoteCommand, env, input);
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
