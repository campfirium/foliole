import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';

import {
  A5_SERIAL,
  assertFixedA5,
  build,
  macosA5GradleEnv,
  macosA5Paths
} from './macos-a5-dev.mjs';

const APP_ID = 'com.foliole.android';
const TEST_APP_ID = `${APP_ID}.test`;
const TEST_CLASS = `${APP_ID}.FolioleCompanionSyncGroupApprovalTest`;
const TEST_RUNNER = `${TEST_APP_ID}/androidx.test.runner.AndroidJUnitRunner`;

function requireSuccess(result, stage) {
  if (result.code === 0) return result;
  throw Object.assign(new Error(`${stage} failed`), { result, stage });
}

function resultText(result) {
  return String(result.stdout || result.output || '').trim();
}

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export async function installedMainMatches({ execute, paths, env, localHash = sha256File(paths.apk) }) {
  const packagePathResult = await execute(paths.adb, [
    '-s', A5_SERIAL, 'shell', 'pm', 'path', APP_ID
  ], { env, timeoutMs: 30_000 });
  const packagePath = resultText(packagePathResult).split(/\r?\n/u)
    .find((line) => line.startsWith('package:'))?.slice('package:'.length);
  if (packagePathResult.code !== 0 || !packagePath) return false;
  const hashResult = await execute(paths.adb, [
    '-s', A5_SERIAL, 'shell', 'sha256sum', packagePath
  ], { env, timeoutMs: 30_000 });
  return hashResult.code === 0 && resultText(hashResult).split(/\s+/u)[0] === localHash;
}

export function parseSyncGroupApprovalReceipt(output, allowControlledCancellation = false) {
  const prefix = 'INSTRUMENTATION_STATUS: folioleSyncGroupApprovalReceipt=';
  const line = String(output).split(/\r?\n/u).find((entry) => entry.startsWith(prefix));
  if (!line || (!allowControlledCancellation && !/^INSTRUMENTATION_CODE: -1$/mu.test(output))) {
    const tail = String(output).trim().split(/\r?\n/u).slice(-24).join(' | ');
    throw new Error(`Sync Group approval instrumentation did not complete: ${tail || 'no output'}`);
  }
  const receipt = JSON.parse(line.slice(prefix.length));
  if (receipt?.ok !== true || receipt.targetTestId !== 'sync-group-approval'
      || receipt.approved !== true || receipt.foreground !== true) {
    throw new Error('Sync Group approval evidence is incomplete.');
  }
  return receipt;
}

export async function startMacosA5SyncGroupApprovalProvider({
  execute, onProviderStopped, onReady, paths, env
}) {
  await onProviderStopped();
  requireSuccess(await execute(paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'start',
    '-W', '-n', `${APP_ID}/.MainActivity`], { env, timeoutMs: 60_000 }), 'provider-ready');
  requireSuccess(await execute(process.execPath, [
    path.join(paths.repoRoot, 'scripts/android/verify-android-launch.mjs'),
    '--adb', paths.adb, '--serial', A5_SERIAL, '--app-id', APP_ID,
    '--component', `${APP_ID}/.MainActivity`, '--timeout-seconds', '30', '--stability-seconds', '3'
  ], { env, timeoutMs: 60_000 }), 'provider-stability');
  await onReady();
}

export async function runMacosA5SyncGroupApproval({ execute, onProviderStopped = async () => {},
  onReady = async () => {}, prepare = build, repoRoot,
  allowControlledCancellation = false, instrumentationExecute = execute }) {
  const paths = macosA5Paths(repoRoot);
  const env = macosA5GradleEnv();
  assertFixedA5(paths);
  prepare(paths);
  const reuseInstalledMain = await installedMainMatches({ execute, paths, env });
  const evidenceRoot = path.join(repoRoot, '.tmp/artifacts/a5-sync-group-approval');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  requireSuccess(await execute(paths.adb, [
    '-s', A5_SERIAL, 'shell', 'am', 'force-stop', APP_ID
  ], { env, timeoutMs: 30_000 }), 'provider-stop-before-install');
  try {
    if (!reuseInstalledMain) {
      requireSuccess(await execute(paths.adb, ['-s', A5_SERIAL, 'install', '-r', paths.apk], {
        env, timeoutMs: 120_000
      }), 'main-install');
    }
    const testApk = path.join(repoRoot, 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk');
    requireSuccess(await execute(paths.adb, ['-s', A5_SERIAL, 'install', '-r', '-t', testApk], {
      env, timeoutMs: 120_000
    }), 'test-install');
    requireSuccess(await execute(paths.adb, ['-s', A5_SERIAL, 'logcat', '-c'], {
      env, timeoutMs: 30_000
    }), 'provider-log-clear');
    await startMacosA5SyncGroupApprovalProvider({ execute, onProviderStopped, onReady, paths, env });
    const run = await instrumentationExecute(paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'instrument',
      '-w', '-r', '-e', 'class', `${TEST_CLASS}#approvesJoinWhileProviderStaysForeground`, TEST_RUNNER], {
      env, timeoutMs: 15 * 60_000
    });
    const controlled = allowControlledCancellation && run.terminationReason === 'cancelled';
    if (!controlled) requireSuccess(run, 'sync-group-approval');
    const receipt = parseSyncGroupApprovalReceipt(run.output, controlled);
    const providerLog = requireSuccess(await execute(paths.adb, ['-s', A5_SERIAL, 'logcat', '-d',
      '-v', 'time', 'FolioleSyncProvider:V', '*:S'], { env, timeoutMs: 30_000 }), 'provider-log');
    const resume = requireSuccess(await execute(paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'start',
      '-W', '-n', `${APP_ID}/.MainActivity`], { env, timeoutMs: 60_000 }), 'provider-resume');
    return { output: `${run.output}${providerLog.output}${resume.output}`, receipt };
  } finally {
    await execute(paths.adb, ['-s', A5_SERIAL, 'uninstall', TEST_APP_ID], { env, timeoutMs: 60_000 });
    await execute(paths.adb, ['kill-server'], { env, timeoutMs: 30_000 });
  }
}
