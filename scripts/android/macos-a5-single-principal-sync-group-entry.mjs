/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { collectAndroidDeviceSnapshot } from './android-device-snapshot.mjs';
import { waitForCurrentA5Provider } from './macos-a5-current-provider-readiness.mjs';
import { openMacosSyncGroupDesktopSession,
  waitForMacosDeviceRequest } from './macos-sync-group-desktop-session.mjs';
import { runMacosA5InstrumentationMechanics } from './macos-a5-sync-group-maintenance-action.mjs';
import {
  assertMacosAcceptanceSyncGroupServer, macosAcceptanceEnv
} from '../sync-group/multi-device-sync-macos-channel.mjs';
import { runMacosA5SyncGroupMaintenance } from '../sync-group/a5-sync-group-action.mjs';

const ACCEPTANCE_APP_ID = 'com.foliole.android.acceptance';
const PRODUCT_APP_ID = 'com.foliole.android';
const TEST_CLASS = `${PRODUCT_APP_ID}.FolioleCompanionSyncGroupJoinTest`;

function buildAcceptance(args) {
  const env = { ...macosAcceptanceEnv(args.env),
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

function captureJoinFailure(args, evidencePath) {
  const localPath = path.join(path.dirname(evidencePath), 'join-failure-screen.png');
  const remotePath = '/sdcard/Download/foliole-a5-join-failure-screen.png';
  try {
    args.checked(args.paths.adb, [
      '-s', args.serial, 'shell', 'screencap', '-p', remotePath
    ]);
    args.checked(args.paths.adb, ['-s', args.serial, 'pull', remotePath, localPath]);
  } catch (error) {
    fs.writeFileSync(`${localPath}.error.txt`, `${error instanceof Error ? error.message : error}\n`);
  } finally {
    try {
      args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'rm', '-f', remotePath]);
    } catch { /* Preserve the original join failure. */ }
  }
}

function validateJoin({ args, evidencePath, stdout }) {
  if (!/folioleSyncGroupJoinReceipt=.*"joined":true.*"restarted":true/u.test(stdout)
      || !/INSTRUMENTATION_CODE: -1/mu.test(stdout)) {
    captureJoinFailure(args, evidencePath);
    const productError = stdout.match(/java\.lang\.(?:IllegalStateException|AssertionError): ([^\r\n]+)/u)?.[1];
    throw Object.assign(new Error('A5 Device join and restart evidence is incomplete.'), {
      evidenceRef: evidencePath, missingFact: 'a5_device_join_persistence', productError
    });
  }
}

function inspectJourneyOrigins(database) {
  const rows = database.prepare(`SELECT title FROM nodes WHERE deleted_at IS NULL
    AND title GLOB 'Multi-device sync [ABC] fact*'`).all();
  return rows.map(({ title }) => title.match(/Multi-device sync ([ABC]) fact/u)?.[1])
    .filter(Boolean).sort();
}

async function waitForMacFact(session, factId) {
  const deadline = Date.now() + 2 * 60_000;
  while (Date.now() < deadline) {
    const snapshot = await session.invoke('load_workspace_list_snapshot', {
      includePdfOpenings: false
    });
    if (snapshot?.nodesById?.[factId]) return snapshot;
    await delay(500);
  }
  throw new Error('Mac did not receive the fixed A5 business fact.');
}

async function captureAcceptanceProcessLog(args, evidenceRoot) {
  const pidResult = await args.execute(args.paths.adb, [
    '-s', args.serial, 'shell', 'pidof', ACCEPTANCE_APP_ID
  ], { env: args.env });
  const pid = String(pidResult.stdout ?? '').trim().split(/\s+/u)[0];
  if (pidResult.code !== 0 || !/^\d+$/u.test(pid)) return;
  const logcat = await args.execute(args.paths.adb, [
    '-s', args.serial, 'logcat', '-d', '--pid', pid, '-v', 'threadtime'
  ], { env: args.env });
  fs.writeFileSync(path.join(evidenceRoot, 'provider-failure-logcat.txt'), String(logcat.output));
}

async function observeAndAccept(session, options = {}) {
  const request = await waitForMacosDeviceRequest(session, null, options);
  const before = await session.load();
  const previousDeviceIds = new Set(before.sync_group?.devices?.map(
    (device) => device.device_identity_key
  ) ?? []);
  const expectedDeviceCount = (before.sync_group?.devices?.length ?? 0) + 1;
  await session.accept(request.request_id);
  const overview = await session.load();
  if (overview.sync_group?.devices?.length !== expectedDeviceCount) {
    throw new Error('Mac did not persist the fixed A5 as the next Device.');
  }
  const joinedDevice = overview.sync_group.devices.find(
    (device) => !previousDeviceIds.has(device.device_identity_key)
  );
  if (!joinedDevice) throw new Error('Mac did not identify the fixed A5 Device.');
  return { acceptedRequestId: request.request_id,
    deviceCount: overview.sync_group.devices.length,
    deviceId: joinedDevice.device_identity_key, deviceName: request.device_name,
    groupId: overview.sync_group.group_id,
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
  const sharedRoot = process.env.FOLIOLE_T152_ACCEPTANCE_ROOT?.trim() || evidenceRoot;
  const backupRoot = path.join(args.paths.deviceBackupRoot, buildIdentity);
  fs.mkdirSync(evidenceRoot, { recursive: true });
  args.markMutationBoundary?.();
  await args.protectData('backup', path.join(evidenceRoot, 'product-baseline.json'), backupRoot);
  const session = await openSession({ env, libraryHome: path.join(sharedRoot, 'macos-library'),
    repoRoot: args.paths.buildRoot, runtimeRoot: path.join(sharedRoot, 'macos-runtime') });
  try {
    assertMacosAcceptanceSyncGroupServer(await session.enable());
    args.checked(args.paths.adb, [
      '-s', args.serial, 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'
    ]);
    args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'wm', 'dismiss-keyguard']);
    const result = await mechanics({ appId: ACCEPTANCE_APP_ID, buildIdentity, env,
      evidenceRoot, execute: args.execute, observeConcurrently: true,
      observeWhileTransportOpen: (options) => observeAndAccept(session, options), paths: args.paths,
      serial: args.serial, testClass: TEST_CLASS,
      validateInstrumentation: (evidence) => validateJoin({ ...evidence, args }) });
    await runMacosA5SyncGroupMaintenance({
      action: 'activate-participation', appId: ACCEPTANCE_APP_ID, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'automatic-enabled'), execute: args.execute,
      installMain: false, paths: args.paths, serial: args.serial
    });
    const androidFact = await runMacosA5SyncGroupMaintenance({
      action: 'create-journey-fact', appId: ACCEPTANCE_APP_ID, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'android-fact'), execute: args.execute,
      installMain: false, paths: args.paths, serial: args.serial
    });
    const factReceipt = JSON.parse(fs.readFileSync(androidFact.manifestPath, 'utf8')).receipt;
    await waitForMacFact(session, factReceipt.factId);
    for (const suffix of ['initial-manual', 'restart-manual']) {
      await runMacosA5SyncGroupMaintenance({
        action: 'sync-now', appId: ACCEPTANCE_APP_ID, buildIdentity, env,
        evidenceRoot: path.join(evidenceRoot, suffix), execute: args.execute,
        installMain: false, paths: args.paths, serial: args.serial
      });
      args.checked(args.paths.adb, [
        '-s', args.serial, 'shell', 'am', 'force-stop', ACCEPTANCE_APP_ID
      ]);
      args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'start', '-W', '-n',
        `${ACCEPTANCE_APP_ID}/${PRODUCT_APP_ID}.MainActivity`]);
    }
    try {
      await waitForCurrentA5Provider({
        deviceId: result.observation.deviceId, groupId: result.observation.groupId
      });
    } catch (error) {
      await captureAcceptanceProcessLog({ ...args, env }, evidenceRoot).catch(() => undefined);
      throw error;
    }
    await session.invoke('sync_companion_now');
    await waitForMacFact(session, factReceipt.factId);
    args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'force-stop', ACCEPTANCE_APP_ID]);
    const snapshot = await collectAndroidDeviceSnapshot({ adb: args.paths.adb,
      appId: ACCEPTANCE_APP_ID, databaseInspector: inspectJourneyOrigins,
      includeAttachments: false, includeEvents: false, serial: args.serial, tables: ['nodes'] });
    const journeyOrigins = snapshot.database?.inspection ?? [];
    if (!['A', 'B', 'C'].every((origin) => journeyOrigins.includes(origin))) {
      throw new Error(`A5 business facts did not converge: ${journeyOrigins.join(',')}`);
    }
    fs.writeFileSync(path.join(evidenceRoot, 'result.json'), `${JSON.stringify({
      buildIdentity, completedAt: new Date().toISOString(),
      androidFactId: factReceipt.factId, journeyOrigins, observation: result.observation,
      resultStatus: 'success', sharedRoot
    }, null, 2)}\n`, 'utf8');
    process.stdout.write(result.output);
  } finally {
    await session.close().catch(() => undefined);
    args.checked(args.paths.adb, ['-s', args.serial, 'uninstall', ACCEPTANCE_APP_ID]);
  }
  await args.protectData('check', path.join(evidenceRoot, 'product-baseline.json'), backupRoot);
  console.log(`[macos-a5-dev] single-principal-sync-group evidence=${evidenceRoot}`);
}
