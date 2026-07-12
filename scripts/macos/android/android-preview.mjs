/* global console, process */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { runInherited } from '../../android/android-host-process.mjs';
import { resolveMacDevice, runMacDeploy } from './android-deploy.mjs';

function manifestPath(repoRoot) {
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  return path.join(repoRoot, '.lab/internal/runtime', `android-preview-before-${stamp}.json`);
}

async function runDataProtection(mode, repoRoot, device, manifest, env) {
  return runInherited(process.execPath, [
    path.join(repoRoot, 'scripts/electron-sqlite-runner.mjs'),
    path.join(repoRoot, 'scripts/android/android-device-data-protection.mjs'),
    '--mode', mode, '--adb', device.adb, '--serial', device.serial,
    '--backup-root', path.join(repoRoot, '.lab/internal/android-device-backups'), '--manifest', manifest
  ], { cwd: repoRoot, env });
}

export async function runMacPreview(repoRoot, sync, env = process.env, dependencies = {}) {
  const resolveDevice = dependencies.resolveDevice ?? resolveMacDevice;
  const deploy = dependencies.deploy ?? runMacDeploy;
  const protectData = dependencies.protectData ?? runDataProtection;
  console.log('[android-preview] step 1/4: sync capacitor android host');
  if (await sync(env) !== 0) return failed('android host sync');
  const device = await resolveDevice(env);
  const protect = env.ANDROID_DATA_PROTECTION !== '0';
  const manifest = manifestPath(repoRoot);
  if (protect) {
    console.log('[android-preview] step 2/4: backup android app data');
    await mkdir(path.dirname(manifest), { recursive: true });
    await mkdir(path.join(repoRoot, '.lab/internal/android-device-backups'), { recursive: true });
    if (await protectData('backup', repoRoot, device, manifest, env) !== 0) return failed('data protection preflight');
  }
  console.log('[android-preview] step 3/4: deploy app');
  const deployEnv = { ...env, FOLIOLE_ANDROID_PREVIEW_DEPLOY: '1', FOLIOLE_ANDROID_SERIAL: device.serial };
  if (await deploy(repoRoot, deployEnv) !== 0) return failed('app deploy');
  if (protect) {
    console.log('[android-preview] step 4/4: check android app data');
    if (await protectData('check', repoRoot, device, manifest, env) !== 0) return failed('data protection check');
  }
  console.log(`[android-preview] device: ${device.serial}`);
  console.log('[android-preview] status: OPENED');
  return 0;
}

function failed(label) {
  console.error(`[android-preview] failed at: ${label}`);
  console.error('[android-preview] status: FAILED');
  return 1;
}
