#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

import { windowsProfileNameFromSshHost } from './windows-device-control.mjs';

function capture(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || `${command} exited ${code}`)));
    child.stdin.end(input || '');
  });
}

export async function setupWindowsDevice(host, env = process.env) {
  if (!host || !/^[A-Za-z0-9._@\\:-]+$/u.test(host)) throw new Error('a Windows SSH host is required');
  const profileName = windowsProfileNameFromSshHost(host);
  const keyPath = env.FOLIOLE_WINDOWS_DEVICE_SSH_KEY || path.join(os.homedir(), '.ssh', 'agent', 'foliole-windows-device');
  const remoteInstaller = env.FOLIOLE_WINDOWS_DEVICE_REMOTE_INSTALLER || `C:/Users/${profileName}/AppData/Local/Temp/install-windows-device-debug.ps1`;
  const token = await capture('gh', ['auth', 'token']);
  if (!token) throw new Error('GitHub CLI returned an empty token');
  return capture('ssh', [
    '-i', keyPath, '-o', 'BatchMode=yes', host,
    'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', remoteInstaller,
    '-SkipSystemSetup', '-SkipKeyLockdown'
  ], token);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  setupWindowsDevice(process.argv[2]).then(console.log).catch((error) => {
    console.error(`[windows-device-remote-setup] ${error.message}`);
    process.exitCode = 1;
  });
}
