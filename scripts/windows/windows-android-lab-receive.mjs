#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { androidLabPaths, readJson } from './windows-android-lab-state.mjs';

export const ANDROID_LAB_RECEIVE_COMMAND = "git-receive-pack 'foliole-android-lab.git'";
export const ANDROID_LAB_REPAIR_RECEIVE_COMMAND = "git-receive-pack 'foliole-android-lab-repair.git'";
export const ANDROID_LAB_RUNTIME_RECEIVE_COMMAND = "git-receive-pack 'foliole-android-lab-runtime.git'";

export function runWindowsAndroidLabReceive({
  env = process.env, paths = androidLabPaths(), spawnImpl = spawn
} = {}) {
  const repair = env.SSH_ORIGINAL_COMMAND === ANDROID_LAB_REPAIR_RECEIVE_COMMAND;
  const runtime = env.SSH_ORIGINAL_COMMAND === ANDROID_LAB_RUNTIME_RECEIVE_COMMAND;
  if (!repair && !runtime && env.SSH_ORIGINAL_COMMAND !== ANDROID_LAB_RECEIVE_COMMAND) {
    throw new Error('Android Lab Git key only accepts the fixed receive-pack command');
  }
  const config = readJson(paths.config);
  if (!config?.gitPath) throw new Error('Android Lab Git configuration is missing');
  const configArgs = repair ? ['-c', 'receive.denyNonFastForwards=false'] : [];
  const repository = runtime ? paths.runtimeRepository : paths.repository;
  const child = spawnImpl(config.gitPath, [...configArgs, 'receive-pack', repository], { shell: false, stdio: 'inherit' });
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
