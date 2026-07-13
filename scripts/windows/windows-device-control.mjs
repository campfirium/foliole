#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function windowsProfileNameFromSshHost(host) {
  const destination = host.slice(0, host.lastIndexOf('@'));
  const profileName = destination.split('\\').at(-1);
  if (!profileName || !/^[A-Za-z0-9._-]+$/u.test(profileName)) throw new Error('Windows SSH host must include a profile user');
  return profileName;
}

export function remoteDevicePaths(host, env, home = os.homedir()) {
  const profileName = windowsProfileNameFromSshHost(host);
  const root = `C:/Users/${profileName}/AppData/Local/Foliole/windows-device`;
  return {
    dispatcher: env.FOLIOLE_WINDOWS_DEVICE_DISPATCHER || `${root}/windows-device-dispatcher.mjs`,
    node: env.FOLIOLE_WINDOWS_DEVICE_NODE || `${root}/runtime/node-v22.23.1-win-x64/node.exe`,
    sshKey: env.FOLIOLE_WINDOWS_DEVICE_SSH_KEY || path.join(home, '.ssh', 'agent', 'foliole-windows-device')
  };
}

export function parseControlArgs(argv, env) {
  const args = [...argv];
  const hostIndex = args.indexOf('--host');
  const host = hostIndex >= 0 ? args.splice(hostIndex, 2)[1] : env.FOLIOLE_WINDOWS_DEVICE_SSH;
  if (!host || !/^[A-Za-z0-9._@\\:-]+$/u.test(host)) throw new Error('--host user@host or FOLIOLE_WINDOWS_DEVICE_SSH is required');
  const outputIndex = args.indexOf('--output');
  const output = outputIndex >= 0 ? args.splice(outputIndex, 2)[1] : null;
  if (!args[0]) throw new Error('device action is required');
  return { command: args, host, output };
}

function ssh(host, command, env) {
  return new Promise((resolve, reject) => {
    const { dispatcher: remoteDispatcher, node: remoteNode, sshKey } = remoteDevicePaths(host, env);
    const child = spawn('ssh', ['-T', '-i', sshKey, host, remoteNode, remoteDispatcher, ...command], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    let stderr = '';
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(Buffer.concat(stdout)) : reject(new Error(stderr.trim() || `ssh exited ${code}`)));
  });
}

export async function runWindowsDeviceControl({ argv = process.argv.slice(2), env = process.env } = {}) {
  const { command, host, output } = parseControlArgs(argv, env);
  const result = await ssh(host, command, env);
  if (output) {
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(output, result);
    return { output: path.resolve(output) };
  }
  process.stdout.write(result);
  if (result.length > 0 && result[result.length - 1] !== 10) process.stdout.write('\n');
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runWindowsDeviceControl().catch((error) => {
    console.error(`[windows-device-control] ${error.message}`);
    process.exitCode = 1;
  });
}
