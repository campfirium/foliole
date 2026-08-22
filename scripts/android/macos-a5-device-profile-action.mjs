/* global process */

import fs from 'node:fs';
import path from 'node:path';

import { collectAndroidDeviceSnapshot } from './android-device-snapshot.mjs';
import { runMacosA5PairSyncPreflight } from './macos-a5-pair-sync-preflight.mjs';
import { inspectPairSyncRecoveryWorkspace } from './android-pair-sync-recovery-readiness.mjs';

const APP_ID = 'com.foliole.android';
const COMPONENT = `${APP_ID}/.MainActivity`;
const TABLES = [
  'attachments', 'companion_meta', 'content_blobs', 'node_order', 'nodes', 'review_log',
  'sync_group_local_state', 'sync_group_members', 'sync_object_state', 'workspace_meta'
];

export async function runMacosA5DeviceProfileEntry(args) {
  args.assertFixed();
  const runId = args.buildIdentity();
  const evidenceRoot = path.join(args.paths.artifactsRoot, 'a5-device-profile', runId);
  const snapshotRoot = path.join(args.paths.deviceBackupRoot, runId);
  const baselineManifest = path.join(evidenceRoot, 'baseline.json');
  const profileBaselineManifest = path.join(evidenceRoot, 'device-profile-baseline.json');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'force-stop', APP_ID]);
  await args.protectData('backup', baselineManifest, snapshotRoot);
  const baseline = await collectProfileSnapshot(args);
  fs.writeFileSync(profileBaselineManifest, `${JSON.stringify({
    capturedAt: new Date().toISOString(), runId, schemaVersion: 1, serial: args.serial,
    snapshot: baseline
  }, null, 2)}\n`);
  const expectedProfile = resolveExpectedProfile(args);
  args.build();
  args.checked(args.paths.adb, ['-s', args.serial, 'install', '-r', args.paths.apk]);
  const first = await launchAndSnapshot(args);
  const second = await launchAndSnapshot(args);
  const pairing = runMacosA5PairSyncPreflight(args.paths);
  const result = assertA5DeviceProfileAcceptance({ baseline, expectedProfile, first, pairing, second });
  const manifestPath = path.join(evidenceRoot, 'device-profile-manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    ...result, baselineBackupRoot: snapshotRoot, completedAt: new Date().toISOString(),
    profileBaselineManifest, resultStatus: 'success', runId, schemaVersion: 1,
    serial: args.serial
  }, null, 2)}\n`);
  process.stdout.write(`[macos-a5-dev] device-profile evidence=${manifestPath}\n`);
  return { manifestPath, result };
}

export function assertA5DeviceProfileAcceptance({ baseline, expectedProfile, first, pairing, second }) {
  const before = facts(baseline);
  const after = facts(first);
  const restart = facts(second);
  if (!first.database?.exists || first.database?.integrity !== 'ok') {
    throw new Error('A5 device profile acceptance could not read a healthy database after install.');
  }
  if (after.deviceProfile !== expectedProfile || restart.deviceProfile !== expectedProfile) {
    throw new Error('A5 current device profile does not match the Android manufacturer/model.');
  }
  if (JSON.stringify(before.content) !== JSON.stringify(after.content)
      || JSON.stringify(after.content) !== JSON.stringify(restart.content)) {
    throw new Error('A5 content or historical source facts changed during device profile migration.');
  }
  if (before.deviceProfile !== expectedProfile && after.localGroupCount !== 0) {
    throw new Error('A5 legacy local Sync Group binding remained active after profile migration.');
  }
  if (before.deviceProfile !== expectedProfile && pairing?.pairingCredentialsPresent !== false) {
    throw new Error('A5 legacy pairing credentials remained active after profile migration.');
  }
  return { after, before, expectedProfile, restart };
}

async function launchAndSnapshot(args) {
  args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'force-stop', APP_ID]);
  args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'start', '-n', COMPONENT]);
  args.checked(process.execPath, [
    path.join(args.paths.buildRoot, 'scripts/android/verify-android-launch.mjs'),
    '--adb', args.paths.adb, '--serial', args.serial, '--app-id', APP_ID,
    '--component', COMPONENT, '--timeout-seconds', '30', '--stability-seconds', '3'
  ], { cwd: args.paths.buildRoot });
  args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'force-stop', APP_ID]);
  return collectProfileSnapshot(args);
}

async function collectProfileSnapshot(args) {
  return collectAndroidDeviceSnapshot({
    adb: args.paths.adb, appId: APP_ID, databaseInspector: inspectPairSyncRecoveryWorkspace,
    includeEvents: false, serial: args.serial, tables: TABLES
  });
}

function resolveExpectedProfile(args) {
  const manufacturer = args.captured(args.paths.adb, [
    '-s', args.serial, 'shell', 'getprop', 'ro.product.manufacturer'
  ]).trim();
  const model = args.captured(args.paths.adb, [
    '-s', args.serial, 'shell', 'getprop', 'ro.product.model'
  ]).trim();
  if (!model) return 'Android companion';
  return manufacturer && !model.toLowerCase().startsWith(manufacturer.toLowerCase())
    ? `${manufacturer} ${model}` : model;
}

function facts(snapshot) {
  const inspection = snapshot.database?.inspection ?? {};
  const counts = Object.fromEntries(['attachments', 'content_blobs', 'nodes', 'review_log']
    .map((table) => [table, snapshot.database?.counts?.[table] ?? 0]));
  return {
    content: {
      attachments: snapshot.attachments?.sha256 ?? null,
      counts,
      protectedContentDigest: inspection.protectedContentDigest ?? null
    },
    deviceProfile: inspection.hostName ?? null,
    localGroupCount: snapshot.database?.counts?.sync_group_local_state ?? null
  };
}
