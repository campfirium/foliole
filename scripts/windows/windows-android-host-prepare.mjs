/* global process */

import fs from 'node:fs';
import path from 'node:path';

import { WINDOWS_A5_LIVE_RELOAD_URL } from './windows-a5-live-reload-contract.mjs';

function failure(message, stage) {
  return Object.assign(new Error(message), { exitCode: 74, stage });
}

function verifyGeneratedConfig(config, liveReload) {
  if (liveReload) {
    if (config.server?.url !== WINDOWS_A5_LIVE_RELOAD_URL || config.server?.cleartext !== true) {
      throw failure('Capacitor sync did not produce the fixed A5 DEV server contract', 'android-cap-sync');
    }
    return;
  }
  if (config.server !== undefined) {
    throw failure('Capacitor sync left a DEV server in the bundled Android config', 'android-cap-sync');
  }
}

async function checked(execute, command, args, options, stage) {
  const result = await execute(command, args, options);
  if (result.code === 0) return result;
  const detail = result.lines?.at(-1) || result.stderr || `${command} exited ${result.code}`;
  throw Object.assign(failure(String(detail).trim(), stage), { result });
}

export async function prepareWindowsAndroidDebugHost({
  env = process.env, execute, fsApi = fs, liveReload = true, paths
}) {
  const commandEnv = {
    ...env,
    Path: `${path.win32.dirname(paths.systemNode)};${env.Path || env.PATH || ''}`
  };
  const options = {
    cwd: paths.repoRoot, env: commandEnv, timeoutMs: 10 * 60_000, windowsHide: true
  };
  const web = await checked(execute, paths.systemNode, [paths.systemNpmCli, 'run', 'android:web:build'], {
    ...options, timeoutCode: 'android_web_build_timeout'
  }, 'android-web-build');
  const capacitorCli = path.join(paths.repoRoot, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');
  const sync = await checked(execute, paths.systemNode, [capacitorCli, 'sync', 'android'], {
    ...options,
    env: { ...commandEnv, FOLIOLE_ANDROID_DEV_LIVE_RELOAD: liveReload ? '1' : '0' },
    timeoutCode: 'android_cap_sync_timeout'
  }, 'android-cap-sync');
  const webIndex = path.join(paths.repoRoot, 'android', 'app', 'src', 'main', 'assets', 'public', 'index.html');
  const configPath = path.join(paths.repoRoot, 'android', 'app', 'src', 'main', 'assets', 'capacitor.config.json');
  if (!fsApi.existsSync(webIndex) || !fsApi.existsSync(configPath)) {
    throw failure('Capacitor sync did not produce Android Web assets and config', 'android-cap-sync');
  }
  const config = JSON.parse(fsApi.readFileSync(configPath, 'utf8').replace(/^\uFEFF/u, ''));
  verifyGeneratedConfig(config, liveReload);
  const sourceStatus = await checked(execute, paths.gitPath, [
    '-C', paths.repoRoot, 'status', '--porcelain', '--untracked-files=all'
  ], { ...options, timeoutCode: 'android_source_status_timeout' }, 'android-source-cleanliness');
  const changedPaths = sourceStatus.stdout.trim();
  if (changedPaths) {
    throw failure(`Android host preparation changed source:\n${changedPaths}`, 'android-source-cleanliness');
  }
  return `${web.output}${sync.output}`;
}
