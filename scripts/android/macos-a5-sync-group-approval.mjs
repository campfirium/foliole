import fs from 'node:fs';
import path from 'node:path';

import { scrubPairSyncDataProtection } from '../windows/windows-a5-pair-sync-recovery-evidence.mjs';
import {
  A5_SERIAL,
  assertFixedA5,
  build,
  macosA5GradleEnv,
  macosA5Paths,
  protectData
} from './macos-a5-dev.mjs';

const APP_ID = 'com.foliole.android';
const TEST_APP_ID = `${APP_ID}.test`;
const TEST_CLASS = `${APP_ID}.FolioleCompanionSyncGroupApprovalTest`;
const TEST_RUNNER = `${TEST_APP_ID}/androidx.test.runner.AndroidJUnitRunner`;

function requireSuccess(result, stage) {
  if (result.code === 0) return result;
  throw Object.assign(new Error(`${stage} failed`), { result, stage });
}

function parseReceipt(output) {
  const prefix = 'INSTRUMENTATION_STATUS: folioleSyncGroupApprovalReceipt=';
  const line = String(output).split(/\r?\n/u).find((entry) => entry.startsWith(prefix));
  if (!line || !/^INSTRUMENTATION_CODE: -1$/mu.test(output)) {
    throw new Error('Sync Group approval instrumentation did not complete.');
  }
  const receipt = JSON.parse(line.slice(prefix.length));
  if (receipt?.ok !== true || receipt.targetTestId !== 'sync-group-approval'
      || receipt.approved !== true || receipt.paused !== true || receipt.resumed !== true) {
    throw new Error('Sync Group approval evidence is incomplete.');
  }
  return receipt;
}

export async function runMacosA5SyncGroupApproval({ execute, repoRoot }) {
  const paths = macosA5Paths(repoRoot);
  const env = macosA5GradleEnv();
  assertFixedA5(paths);
  build(paths);
  const evidenceRoot = path.join(repoRoot, '.tmp/artifacts/a5-sync-group-approval');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const manifest = path.join(evidenceRoot, 'data-protection.json');
  await protectData(paths, env, 'backup', manifest);
  try {
    requireSuccess(await execute(paths.adb, ['-s', A5_SERIAL, 'install', '-r', paths.apk], {
      env, timeoutMs: 120_000
    }), 'main-install');
    const testApk = path.join(repoRoot, 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk');
    requireSuccess(await execute(paths.adb, ['-s', A5_SERIAL, 'install', '-r', '-t', testApk], {
      env, timeoutMs: 120_000
    }), 'test-install');
    await protectData(paths, env, 'check', manifest);
    scrubPairSyncDataProtection(fs, manifest);
    const run = requireSuccess(await execute(paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'instrument',
      '-w', '-r', '-e', 'class', `${TEST_CLASS}#approvesJoinAndResumesProviderAfterBackgroundPause`, TEST_RUNNER], {
      env, timeoutMs: 15 * 60_000
    }), 'sync-group-approval');
    return { output: run.output, receipt: parseReceipt(run.output) };
  } finally {
    await execute(paths.adb, ['-s', A5_SERIAL, 'uninstall', TEST_APP_ID], { env, timeoutMs: 60_000 });
    await execute(paths.adb, ['kill-server'], { env, timeoutMs: 30_000 });
  }
}
