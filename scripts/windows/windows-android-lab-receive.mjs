#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { androidLabPaths, readJson } from './windows-android-lab-state.mjs';

export const ANDROID_LAB_RECEIVE_COMMAND = "git-receive-pack 'foliole-android-lab.git'";

export function runWindowsAndroidLabReceive({
  env = process.env, paths = androidLabPaths(), spawnImpl = spawn
} = {}) {
  if (env.SSH_ORIGINAL_COMMAND !== ANDROID_LAB_RECEIVE_COMMAND) {
    throw new Error('Android Lab Git key only accepts the fixed receive-pack command');
  }
  const config = readJson(paths.config);
  if (!config?.gitPath) throw new Error('Android Lab Git configuration is missing');
  const child = spawnImpl(config.gitPath, ['receive-pack', paths.repository], { shell: false, stdio: 'inherit' });
  child.on('error', (error) => {
    console.error(`[windows-android-lab-receive] ${error.message}`);
    process.exitCode = 1;
  });
  child.on('close', (code) => { process.exitCode = code ?? 1; });
  return child;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    runWindowsAndroidLabReceive();
  } catch (error) {
    console.error(`[windows-android-lab-receive] ${error.message}`);
    process.exitCode = 1;
  }
}
