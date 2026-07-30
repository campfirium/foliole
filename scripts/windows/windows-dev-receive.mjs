#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const WINDOWS_DEV_RECEIVE_COMMAND = "git-receive-pack 'foliole-dev.git'";

export function resolveReceivePaths(env = process.env) {
  if (!env.LOCALAPPDATA || !env.USERPROFILE) {
    throw new Error('Windows Git receiver requires LOCALAPPDATA and USERPROFILE');
  }
  return {
    gitPath: path.win32.join(env.USERPROFILE, 'scoop', 'apps', 'git', 'current', 'cmd', 'git.exe'),
    repository: path.win32.join(env.LOCALAPPDATA, 'Foliole', 'windows-dev-git', 'repository.git')
  };
}

export function runWindowsDevReceive({
  env = process.env, paths = resolveReceivePaths(env), spawnImpl = spawn
} = {}) {
  if (env.SSH_ORIGINAL_COMMAND !== WINDOWS_DEV_RECEIVE_COMMAND) {
    throw new Error('Windows DEV Git key only accepts the fixed receive-pack command');
  }
  const child = spawnImpl(paths.gitPath, ['receive-pack', paths.repository], {
    shell: false, stdio: 'inherit', windowsHide: true
  });
  child.on('error', (error) => {
    console.error(`[windows-dev-receive] ${error.message}`);
    process.exitCode = 1;
  });
  child.on('close', (code) => { process.exitCode = code ?? 1; });
  return child;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    runWindowsDevReceive();
  } catch (error) {
    console.error(`[windows-dev-receive] ${error.message}`);
    process.exitCode = 1;
  }
}
