/* global console */

import fs from 'node:fs';
import path from 'node:path';

import { macosAcceptanceEnv } from '../sync-group/multi-device-sync-macos-channel.mjs';
import { observeMacosAnchorAfterElection } from './macos-a5-anchor-observation.mjs';
import { openMacosSyncGroupDesktopSession } from './macos-sync-group-desktop-session.mjs';
import { runMacosA5InstrumentationMechanics } from './macos-a5-sync-group-maintenance-action.mjs';
import { instrumentation } from './macos-a5-s220-offline.mjs';
import { inspectS220A5Group } from './macos-a5-s220-group-inspect.mjs';
import { confirmS220A5NetworkRestored } from './macos-a5-s220-network-status.mjs';
import { S220_APP_ID } from './macos-a5-s220-package-inventory.mjs';

async function observe(args, root, fixture, groupId, phase) {
  const result = await runMacosA5InstrumentationMechanics({ appId: S220_APP_ID,
    buildIdentity: args.buildIdentity, env: args.env, evidenceRoot: path.join(root, phase),
    execute: args.execute, installMain: false, needsTransport: false,
    instrumentationOwnsActivity: true, instrumentationArgs: [
      '-e', 'resourcePhase', phase, '-e', 'resourceNodeId', fixture.nodeId,
      '-e', 'resourceGroupId', groupId, '-e', 'availableHash', fixture.images[0].hash,
      '-e', 'recoveringHash', fixture.images[1].hash
    ], paths: args.paths, serial: args.serial,
    testClass: 'com.foliole.android.FolioleResourceLanTest',
    validateInstrumentation: ({ stdout }) => {
      if (!/folioleResourceLanReceipt=.*"passed":true/u.test(stdout)) {
        throw new Error(`S220 resource ${phase} did not pass on physical A5.`);
      }
    } });
  return result.evidencePath;
}

export async function verifyS220A5Resource(args) {
  const { assertFixed, captured, checked, env, paths, serial } = args;
  assertFixed();
  const root = path.join(paths.artifactsRoot, 'S220', 'final-same-tip', 'a5-resource');
  const receiptPath = path.join(root, 'receipt.json');
  if (fs.existsSync(receiptPath)) throw new Error('S220 resource final verification already attempted.');
  const fixture = JSON.parse(fs.readFileSync(path.join(paths.artifactsRoot, 'S220',
    'a5-resource', 'receipt.json'), 'utf8')).fixture;
  if (!fixture?.nodeId || fixture.images?.length !== 2) {
    throw new Error('S220 isolated resource fixture is absent.');
  }
  const beforePath = await inspectS220A5Group({ assertFixed, paths, serial });
  const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
  const files = before.attachments?.files ?? [];
  if (!fixture.images.every((image) => files.some((file) =>
    file.contentHash === image.hash && file.storageKey === image.storageKey))) {
    throw new Error('S220 restored resources are not both cached on physical A5.');
  }
  const sharedRoot = path.join(paths.artifactsRoot, 'S220', 'fri-native-diagnostic', 'shared');
  const session = await openMacosSyncGroupDesktopSession({ env: macosAcceptanceEnv(env),
    libraryHome: path.join(sharedRoot, 'macos-library'), repoRoot: paths.buildRoot,
    runtimeLogPath: path.join(root, 'final-desktop-runtime.log'),
    runtimeRoot: path.join(sharedRoot, 'macos-runtime') });
  const receipt = { appId: S220_APP_ID, cachedFiles: files, stage: 'cached-on-a5' };
  const save = () => fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  fs.mkdirSync(root, { recursive: true });
  save();
  let disconnected = false;
  try {
    const overview = await session.load();
    if (overview.server_status?.state !== 'running'
      || overview.sync_group?.group_id !== before.inspection.group.group_id) {
      throw new Error('S220 isolated Mac group not ready.');
    }
    receipt.anchor = await observeMacosAnchorAfterElection(session);
    receipt.online = await observe(args, root, fixture,
      overview.sync_group.group_id, 'restored');
    checked(paths.adb, ['-s', serial, 'install', '-r', '-t', paths.androidTestApk]);
    disconnected = true;
    receipt.networkOff = instrumentation(captured, paths, serial, 'disconnectOnly');
    if (JSON.parse(receipt.networkOff ?? '{}').offline !== true) {
      throw new Error('S220 A5 active-network-null not proved.');
    }
    receipt.offline = await observe(args, root, fixture,
      overview.sync_group.group_id, 'offline');
    receipt.stage = 'cached-offline';
  } catch (error) {
    receipt.error = String(error.message).slice(0, 500);
    throw error;
  } finally {
    try {
      if (disconnected) {
        try {
          checked(paths.adb, ['-s', serial, 'install', '-r', '-t', paths.androidTestApk]);
          receipt.networkRestored = instrumentation(captured, paths, serial, 'restoreOnly');
        } catch (error) {
          receipt.restoreError = String(error.message).slice(0, 500);
          try {
            checked(paths.adb, ['-s', serial, 'shell', 'svc', 'wifi', 'enable']);
            checked(paths.adb, ['-s', serial, 'shell', 'svc', 'data', 'disable']);
          } catch (fallbackError) {
            receipt.fallbackError = String(fallbackError.message).slice(0, 500);
          }
        }
      }
    } finally {
      try { save(); }
      finally { await session.close(); }
    }
  }
  try {
    receipt.networkStatus = await confirmS220A5NetworkRestored({ assertFixed,
      execute: args.execute, paths, receipt, serial });
    receipt.resultStatus = 'success';
    save();
    console.log(`[macos-a5-dev] S220 resource verification=${receiptPath}`);
    return receipt;
  } catch (error) {
    receipt.error = String(error.message).slice(0, 500);
    save();
    throw error;
  }
}
