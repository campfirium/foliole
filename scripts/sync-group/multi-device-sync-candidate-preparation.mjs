import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { A5_SERIAL, macosA5Paths } from '../android/macos-a5-dev.mjs';

/* global process */

const exec = promisify(execFile);

function run(command, args, repoRoot, timeout = 20 * 60_000) {
  return exec(command, args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    timeout });
}

async function prepareMacos(execute, repoRoot) {
  await execute('npm', ['run', 'build'], repoRoot);
  await execute('npm', ['run', 'electron:compile'], repoRoot);
}

async function prepareAndroid(execute, paths, repoRoot) {
  await execute(process.execPath, ['scripts/android/macos-a5-dev.mjs', 'build'], repoRoot);
  await execute(paths.adb, ['-s', A5_SERIAL, 'install', '-r', paths.apk], repoRoot, 5 * 60_000);
  await execute(paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'force-stop',
    'com.foliole.android'], repoRoot, 10_000);
  await execute(paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'start', '-W', '-n',
    'com.foliole.android/.MainActivity'], repoRoot, 20_000);
}

async function prepareWindows(execute, repoRoot) {
  const result = await execute(process.execPath,
    ['scripts/windows/windows-dev-control.mjs', 'multi-device-sync-candidate'], repoRoot);
  const receipt = result.stdout.split(/\r?\n/u).find((line) =>
    line.includes('[windows-dev-action] multi-device-sync-candidate'));
  if (!receipt) throw Object.assign(new Error('Windows candidate did not report fixed evidence.'), {
    failureOwner: 'candidate', host: 'windows-c', missingFact: 'windows_candidate_unbound'
  });
  return receipt;
}

export async function prepareCandidate({ execute = run, repoRoot,
  paths = macosA5Paths(repoRoot), requiredHosts, runId }) {
  const hosts = new Set(requiredHosts);
  if (hosts.has('macos-a')) await prepareMacos(execute, repoRoot);
  if (hosts.has('android-b')) await prepareAndroid(execute, paths, repoRoot);
  const windowsReceipt = hosts.has('windows-c') ? await prepareWindows(execute, repoRoot) : undefined;
  const apk = path.join(repoRoot, 'android/app/build/outputs/apk/debug/app-debug.apk');
  const receipt = {
    ...(hosts.has('android-b') ? {
      androidApkSha256: createHash('sha256').update(fs.readFileSync(apk)).digest('hex')
    } : {}),
    completedAt: new Date().toISOString(), preparedHosts: [...hosts],
    resultStatus: 'success', runId, ...(windowsReceipt ? { windowsReceipt } : {})
  };
  const evidenceRef = path.join(repoRoot, '.tmp', 'artifacts', 'multi-device-sync', 'runs', runId,
    'candidate-preparation.json');
  fs.mkdirSync(path.dirname(evidenceRef), { recursive: true });
  fs.writeFileSync(evidenceRef, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { evidenceRef, progress: receipt.preparedHosts.map((host) => `${host}-built`) };
}
