/* global console, process */

import fs from 'node:fs';
import path from 'node:path';

import { openMacosSyncGroupDesktopSession,
  waitForMacosDeviceRequest } from './macos-sync-group-desktop-session.mjs';
import { runMacosA5InstrumentationMechanics } from './macos-a5-sync-group-maintenance-action.mjs';

const ACCEPTANCE_APP_ID = 'com.foliole.android.acceptance';
const PRODUCT_APP_ID = 'com.foliole.android';
const TEST_CLASS = `${PRODUCT_APP_ID}.FolioleCompanionSyncGroupJoinTest`;

function buildAcceptance(args) {
  const env = { ...args.env,
    FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID: ACCEPTANCE_APP_ID };
  args.checked('npm', ['run', 'android:web:build'], { cwd: args.paths.buildRoot, env });
  args.checked(args.paths.cap, ['sync', 'android'], { cwd: args.paths.buildRoot, env });
  args.checked(args.paths.gradle, [
    '--no-daemon', 'assembleDebug', 'assembleDebugAndroidTest'
  ], { cwd: path.join(args.paths.buildRoot, 'android'), env });
  args.checked('npm', ['run', 'build'], { cwd: args.paths.buildRoot, env });
  args.checked('npm', ['run', 'electron:compile'], { cwd: args.paths.buildRoot, env });
  if (!fs.existsSync(args.paths.apk)) throw new Error('A5 acceptance APK was not produced.');
  return env;
}

function validateJoin({ evidencePath, stdout }) {
  if (!/folioleSyncGroupJoinReceipt=.*"joined":true.*"restarted":true/u.test(stdout)
      || !/INSTRUMENTATION_CODE: -1/mu.test(stdout)) {
    throw Object.assign(new Error('A5 Device join and restart evidence is incomplete.'), {
      evidenceRef: evidencePath, missingFact: 'a5_device_join_persistence'
    });
  }
}

async function observeAndAccept(session) {
  const request = await waitForMacosDeviceRequest(session, null);
  await session.accept(request.request_id);
  const overview = await session.load();
  if (overview.sync_group?.devices?.length !== 2) {
    throw new Error('Mac did not persist the fixed A5 as the second Device.');
  }
  return { acceptedRequestId: request.request_id,
    deviceCount: overview.sync_group.devices.length,
    deviceName: request.device_name, groupId: overview.sync_group.group_id,
    serverPort: overview.server_status.port };
}

export async function runMacosA5SinglePrincipalSyncGroupEntry(args, dependencies = {}) {
  const mechanics = dependencies.mechanics ?? runMacosA5InstrumentationMechanics;
  const openSession = dependencies.openSession ?? openMacosSyncGroupDesktopSession;
  args.assertFixed();
  const env = buildAcceptance(args);
  const buildIdentity = args.buildIdentity();
  const evidenceRoot = path.join(
    args.paths.artifactsRoot, 'a5-single-principal-sync-group', buildIdentity
  );
  const backupRoot = path.join(args.paths.deviceBackupRoot, buildIdentity);
  fs.mkdirSync(evidenceRoot, { recursive: true });
  args.markMutationBoundary?.();
  await args.protectData('backup', path.join(evidenceRoot, 'product-baseline.json'), backupRoot);
  const session = await openSession({ env, libraryHome: path.join(evidenceRoot, 'macos-library'),
    repoRoot: args.paths.buildRoot, runtimeRoot: path.join(evidenceRoot, 'macos-runtime') });
  try {
    await session.enable();
    args.checked(args.paths.adb, [
      '-s', args.serial, 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'
    ]);
    args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'wm', 'dismiss-keyguard']);
    const result = await mechanics({ appId: ACCEPTANCE_APP_ID, buildIdentity, env,
      evidenceRoot, execute: args.execute, observeConcurrently: true,
      observeWhileTransportOpen: () => observeAndAccept(session), paths: args.paths,
      serial: args.serial, testClass: TEST_CLASS, validateInstrumentation: validateJoin });
    fs.writeFileSync(path.join(evidenceRoot, 'result.json'), `${JSON.stringify({
      buildIdentity, completedAt: new Date().toISOString(),
      observation: result.observation, resultStatus: 'success'
    }, null, 2)}\n`, 'utf8');
    process.stdout.write(result.output);
  } finally {
    await session.close().catch(() => undefined);
    args.checked(args.paths.adb, ['-s', args.serial, 'uninstall', ACCEPTANCE_APP_ID]);
  }
  await args.protectData('check', path.join(evidenceRoot, 'product-baseline.json'), backupRoot);
  console.log(`[macos-a5-dev] single-principal-sync-group evidence=${evidenceRoot}`);
}
