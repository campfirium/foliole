#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function remoteAndroidLabPaths(env, home = os.homedir()) {
  return {
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

export function androidLabSshArgs(host, command, env, home = os.homedir()) {
  const remote = remoteAndroidLabPaths(env, home);
  return [
    '-T', '-i', remote.sshKey, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
    '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', host, ...command
  ];
}

export async function runWindowsAndroidLabControl({ argv = process.argv.slice(2), env = process.env } = {}) {
  const { command, host, output } = parseAndroidLabControlArgs(argv, env);
  const result = await ssh(host, command, env);
  if (output) {
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(output, result);
    return { output: path.resolve(output) };
  }
  process.stdout.write(result);
  if (result.length > 0 && result.at(-1) !== 10) process.stdout.write('\n');
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runWindowsAndroidLabControl().catch((error) => {
    console.error(`[windows-android-lab-control] ${error.message}`);
    process.exitCode = 1;
  });
}
