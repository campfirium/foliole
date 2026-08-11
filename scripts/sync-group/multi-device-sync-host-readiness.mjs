import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { A5_SERIAL, macosA5Paths } from '../android/macos-a5-dev.mjs';
import { verifyAndroidLaunch } from '../android/verify-android-launch.mjs';
import { WINDOWS_DEV_DEFAULT_SSH } from '../windows/windows-dev-control.mjs';
import { assertIsolatedMacosRoot } from './multi-device-sync-workspace.mjs';

/* global process */

const exec = promisify(execFile);
const APP = 'com.foliole.android';
const WINDOWS_NODE = 'C:/Progra~1/nodejs/node.exe';
const WINDOWS_READINESS = 'C:/dev/foliole-android-lab-preview/scripts/windows/windows-multi-device-sync-readiness.mjs';

async function bounded(command, args, options = {}) {
  const result = await exec(command, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    timeout: 10_000, ...options });
  return `${result.stdout}${result.stderr}`;
}

function fixedDevice(output) {
  const row = output.split(/\r?\n/u).map((line) => line.trim().split(/\s+/u))
    .find(([serial]) => serial === A5_SERIAL);
  if (!row || row[1] !== 'device') throw Object.assign(new Error('Fixed A5 is unavailable.'), {
    missingFact: 'fixed_a5_unavailable', lastSuccessfulAction: 'adb_devices_read'
  });
}

export function createHostReadinessAdapters({ env = process.env, execute = bounded,
  fsApi = fs, repoRoot, runId, verifyLaunch = verifyAndroidLaunch,
  windowsHost = WINDOWS_DEV_DEFAULT_SSH }) {
  const paths = macosA5Paths(repoRoot);
  return {
    'macos-a': async () => {
      const root = path.join(repoRoot, '.tmp', 'artifacts', 'multi-device-sync', 'runs', runId, 'macos-a');
      assertIsolatedMacosRoot({ fsApi, repoRoot, root, runId });
      const free = fsApi.statfsSync(root).bavail * fsApi.statfsSync(root).bsize;
      if (free < 4 * 1024 ** 3) throw Object.assign(new Error('macOS acceptance disk is low.'), {
        missingFact: 'macos_disk_budget_missing', lastSuccessfulAction: 'isolated_owner_checked'
      });
      return { facts: ['macos_isolated_owner_ready', 'macos_disk_ready'] };
    },
    'android-b': async () => {
      const output = await execute(paths.adb, ['start-server'], { env });
      void output;
      await execute(paths.adb, ['-s', A5_SERIAL, 'wait-for-device'], { env, timeout: 10_000 });
      fixedDevice(await execute(paths.adb, ['devices', '-l'], { env }));
      await execute(paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'start', '-W', '-n', `${APP}/.MainActivity`], {
        env, timeout: 20_000
      });
      const launch = await verifyLaunch({ adb: paths.adb, appId: APP,
        component: `${APP}/.MainActivity`, serial: A5_SERIAL,
        stabilitySeconds: 2, timeoutSeconds: 10 });
      if (!launch.ok) throw Object.assign(new Error('Foliole is not stably foregrounded on A5.'), {
        missingFact: 'android_app_window_focus_missing', lastSuccessfulAction: 'android_activity_started'
      });
      return { facts: ['fixed_a5_ready', 'android_workspace_ready'] };
    },
    'windows-c': async () => {
      const key = env.FOLIOLE_WINDOWS_DEV_GIT_SSH_KEY
        || path.join(process.env.HOME, '.ssh', 'agent', 'foliole-windows-android-lab');
      const args = ['-T', '-i', key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
        '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', windowsHost,
        WINDOWS_NODE, WINDOWS_READINESS];
      let output;
      try { output = await execute('ssh', args, { env }); }
      catch (error) {
        const detail = `${error.stdout || ''}${error.stderr || ''}`;
        const missing = /missingFact=([^\s]+)/u.exec(detail)?.[1];
        throw Object.assign(new Error('Windows acceptance readiness command failed.'), {
          lastSuccessfulAction: 'windows_ssh_connected',
          missingFact: missing || 'windows_readiness_command_failed'
        });
      }
      if (!output.includes('[multi-device-sync-readiness] status=ready')) {
        throw Object.assign(new Error('Windows acceptance readiness is incomplete.'), {
          missingFact: 'windows_readiness_missing', lastSuccessfulAction: 'windows_ssh_connected'
        });
      }
      return { facts: ['windows_ssh_ready', 'windows_repo_ready', 'windows_isolated_owner_ready'] };
    }
  };
}

export function createMutationReadinessAdapters(options) {
  const adapters = createHostReadinessAdapters(options);
  const receiptPath = path.join(options.repoRoot, '.tmp', 'artifacts', 'multi-device-sync',
    'runs', options.runId, 'candidate-preparation.json');
  const apkPath = path.join(options.repoRoot, 'android/app/build/outputs/apk/debug/app-debug.apk');
  const requireCandidate = async (host, action) => {
    const result = await action();
    if (!fs.existsSync(receiptPath)) throw Object.assign(new Error('Candidate receipt is missing.'), {
      lastSuccessfulAction: `${host}_environment_ready`, missingFact: 'candidate_receipt_missing'
    });
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    if (receipt.runId !== options.runId || receipt.resultStatus !== 'success'
        || !receipt.windowsReceipt || !fs.existsSync(apkPath)
        || createHash('sha256').update(fs.readFileSync(apkPath)).digest('hex')
          !== receipt.androidApkSha256) {
      throw Object.assign(new Error('Candidate artifacts do not match the receipt.'), {
        lastSuccessfulAction: `${host}_environment_ready`, missingFact: `${host}_candidate_mismatch`
      });
    }
    return { facts: [...result.facts, `${host}_candidate_bound`] };
  };
  return Object.fromEntries(Object.entries(adapters).map(([host, action]) => [
    host, () => requireCandidate(host, action)
  ]));
}
