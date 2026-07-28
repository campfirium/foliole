#!/usr/bin/env node
/* global console, process */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  androidLabPaths, readJson, WINDOWS_ANDROID_LAB_RUNTIME_REF
} from './windows-android-lab-state.mjs';

export const ANDROID_LAB_RECEIVE_COMMAND = "git-receive-pack 'foliole-android-lab.git'";
export const ANDROID_LAB_REPAIR_RECEIVE_COMMAND = "git-receive-pack 'foliole-android-lab-repair.git'";
export const ANDROID_LAB_RUNTIME_RECEIVE_COMMAND = "git-receive-pack 'foliole-android-lab-runtime.git'";

function runGit(spawnSyncImpl, gitPath, args) {
  const result = spawnSyncImpl(gitPath, args, { encoding: 'utf8', shell: false });
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || 'Git failed').trim());
}

export function ensureAndroidLabRuntimeRepository({ gitPath, paths, spawnSyncImpl = spawnSync }) {
  if (!fs.existsSync(path.join(paths.runtimeRepository, 'HEAD'))) {
    runGit(spawnSyncImpl, gitPath, ['init', '--bare', paths.runtimeRepository]);
  }
  runGit(spawnSyncImpl, gitPath, ['--git-dir', paths.runtimeRepository, 'config', 'receive.denyDeletes', 'true']);
  runGit(spawnSyncImpl, gitPath, ['--git-dir', paths.runtimeRepository, 'config', 'receive.denyNonFastForwards', 'true']);
  const hook = `#!/bin/sh
while read old new updated_ref; do
  if [ "$updated_ref" != "${WINDOWS_ANDROID_LAB_RUNTIME_REF}" ]; then exit 1; fi
  if [ "$new" = "0000000000000000000000000000000000000000" ]; then exit 1; fi
done
`;
  const hookPath = path.join(paths.runtimeRepository, 'hooks', 'pre-receive');
  fs.mkdirSync(path.dirname(hookPath), { recursive: true });
  fs.writeFileSync(hookPath, hook, { encoding: 'utf8', mode: 0o755 });
}

export function runWindowsAndroidLabReceive({
  env = process.env, paths = androidLabPaths(), spawnImpl = spawn, spawnSyncImpl = spawnSync
} = {}) {
  const repair = env.SSH_ORIGINAL_COMMAND === ANDROID_LAB_REPAIR_RECEIVE_COMMAND;
  const runtime = env.SSH_ORIGINAL_COMMAND === ANDROID_LAB_RUNTIME_RECEIVE_COMMAND;
  if (!repair && !runtime && env.SSH_ORIGINAL_COMMAND !== ANDROID_LAB_RECEIVE_COMMAND) {
    throw new Error('Android Lab Git key only accepts the fixed receive-pack command');
  }
  const config = readJson(paths.config);
  if (!config?.gitPath) throw new Error('Android Lab Git configuration is missing');
  if (runtime) ensureAndroidLabRuntimeRepository({ gitPath: config.gitPath, paths, spawnSyncImpl });
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
