import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { collectAndroidDeviceSnapshot } from './android-device-snapshot.mjs';
import { inspectTwoDeviceJourneyFacts } from './macos-a5-single-principal-sync-group-facts.mjs';
import { runMacosA5InstrumentationMechanics } from './macos-a5-sync-group-maintenance-action.mjs';
import { runMacosA5SyncGroupMaintenance } from '../sync-group/a5-sync-group-action.mjs';

/* global console */

const ACCEPTANCE_APP_ID = 'com.foliole.android.acceptance';
const PRODUCT_APP_ID = 'com.foliole.android';
const TEST_CLASS = `${PRODUCT_APP_ID}.FolioleCompanionSyncGroupJoinTest`;

function validateJoin({ evidencePath, stdout }) {
  if (!/folioleSyncGroupJoinReceipt=.*"joined":true.*"restarted":true/u.test(stdout)
      || !/"prejoinFactId":"[^"]+"/u.test(stdout)
      || !/INSTRUMENTATION_CODE: -1/mu.test(stdout)) {
    throw Object.assign(new Error('A5 Device join and pre-existing fact evidence is incomplete.'), {
      evidenceRef: evidencePath, missingFact: 'a5_two_device_join_persistence'
    });
  }
}

async function snapshot(args) {
  return collectAndroidDeviceSnapshot({ adb: args.paths.adb, appId: ACCEPTANCE_APP_ID,
    databaseInspector: inspectTwoDeviceJourneyFacts, includeAttachments: false,
    includeEvents: false, serial: args.serial, tables: ['nodes', 'sync_group_devices'] });
}

async function waitForCounts(args, expected, timeoutMs = 3 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'force-stop', ACCEPTANCE_APP_ID]);
    latest = await snapshot(args);
    const counts = latest.database?.inspection?.originCounts ?? {};
    if (Object.entries(expected).every(([origin, count]) => (counts[origin] ?? 0) >= count)) {
      args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'start', '-W', '-n',
        `${ACCEPTANCE_APP_ID}/${PRODUCT_APP_ID}.MainActivity`]);
      return latest;
    }
    args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'start', '-W', '-n',
      `${ACCEPTANCE_APP_ID}/${PRODUCT_APP_ID}.MainActivity`]);
    await delay(500);
  }
  throw new Error(`A5 business facts did not converge: ${JSON.stringify(latest?.database?.inspection)}`);
}

export async function runMacosA5WindowsTwoDeviceEntry({ args, buildIdentity, env,
  evidenceRoot }) {
  const backupRoot = path.join(args.paths.deviceBackupRoot, buildIdentity);
  args.markMutationBoundary?.();
  await args.protectData('backup', path.join(evidenceRoot, 'product-baseline.json'), backupRoot);
  try {
    const joined = await runMacosA5InstrumentationMechanics({ appId: ACCEPTANCE_APP_ID,
      buildIdentity, env, evidenceRoot, execute: args.execute, paths: args.paths,
      serial: args.serial, testClass: TEST_CLASS,
      validateInstrumentation: (evidence) => validateJoin(evidence) });
    await runMacosA5SyncGroupMaintenance({ action: 'activate-participation',
      appId: ACCEPTANCE_APP_ID, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'automatic-enabled'), execute: args.execute,
      installMain: false, paths: args.paths, serial: args.serial });
    await waitForCounts(args, { A: 2, B: 1 });
    const automatic = await runMacosA5SyncGroupMaintenance({ action: 'create-journey-fact',
      appId: ACCEPTANCE_APP_ID, buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'automatic-fact'), execute: args.execute,
      installMain: false, paths: args.paths, serial: args.serial });
    const beforeRepeat = await waitForCounts(args, { A: 2, B: 2 });
    for (const suffix of ['manual-1', 'manual-2']) {
      await runMacosA5SyncGroupMaintenance({ action: 'sync-now', appId: ACCEPTANCE_APP_ID,
        buildIdentity, env, evidenceRoot: path.join(evidenceRoot, suffix), execute: args.execute,
        installMain: false, paths: args.paths, serial: args.serial });
    }
    const final = await waitForCounts(args, { A: 2, B: 2 });
    if (JSON.stringify(final.database.inspection.foundIds.sort())
        !== JSON.stringify(beforeRepeat.database.inspection.foundIds.sort())) {
      throw new Error('Repeated A5 sync was not idempotent.');
    }
    fs.writeFileSync(path.join(evidenceRoot, 'result.json'), `${JSON.stringify({ buildIdentity,
      completedAt: new Date().toISOString(), instrumentation: joined.evidencePath,
      idempotent: true, journeyFacts: final.database.inspection, resultStatus: 'success',
      secondFactManifest: automatic.manifestPath
    }, null, 2)}\n`, 'utf8');
  } finally {
    args.checked(args.paths.adb, ['-s', args.serial, 'uninstall', ACCEPTANCE_APP_ID]);
  }
  await args.protectData('check', path.join(evidenceRoot, 'product-baseline.json'), backupRoot);
  console.log(`[macos-a5-dev] two-device-windows-provider evidence=${evidenceRoot}`);
}
