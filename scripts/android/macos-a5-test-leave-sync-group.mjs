import fs from 'node:fs';
import path from 'node:path';

import { runMacosA5SyncGroupMaintenance } from '../sync-group/a5-sync-group-action.mjs';

import { collectAndroidDeviceSnapshot } from './android-device-snapshot.mjs';
import { inspectPairSyncRecoveryWorkspace } from './android-pair-sync-recovery-readiness.mjs';
import { A5_TEST_APP_ID, macosA5AppId } from './macos-a5-app-identity.mjs';

/**
 * Read-only proof that the test app is a group member before it departs. Unsynced test
 * changes stay on the phone and are recorded, not synced: the test group may then differ.
 */
export async function inspectTestAppDeparturePreflight({ env, execute, paths, serial }, dependencies = {}) {
  const collectSnapshot = dependencies.collectSnapshot ?? collectAndroidDeviceSnapshot;
  const appId = macosA5AppId(env);
  if (appId !== A5_TEST_APP_ID) throw new Error('Test-app leave runs only against the A5 test application.');
  const stopped = await execute(paths.adb, ['-s', serial, 'shell', 'am', 'force-stop', appId],
    { env, timeoutCode: 'test_leave_stop_timeout', timeoutMs: 30_000 });
  if (stopped.code !== 0) throw Object.assign(new Error('Failed to stop the A5 test application.'), { result: stopped });
  const snapshot = await collectSnapshot({ adb: paths.adb, appId, databaseInspector: inspectPairSyncRecoveryWorkspace,
    includeAttachments: false, includeEvents: false, serial, tables: ['nodes'] });
  const inspection = snapshot.database?.inspection;
  if (snapshot.database?.integrity !== 'ok' || !inspection) throw new Error('A5 test application snapshot is unavailable.');
  if (typeof inspection.syncGroupId !== 'string' || !inspection.syncGroupId) {
    throw new Error('The A5 test application is not in a sync group.');
  }
  return { appId, unsyncedChangesKeptLocally: inspection.dirtyRecordCount ?? 0, nodeCount: inspection.nodeCount,
    syncGroupId: inspection.syncGroupId };
}

/**
 * Leave the test group through the product's own Leave flow. Unlike the daily joined-empty
 * reauthorization, the test library keeps its content, so the gate is membership only; the
 * daily application is never touched.
 */
export async function leaveMacosA5TestAppSyncGroup(args, dependencies = {}) {
  const maintenance = dependencies.maintenance ?? runMacosA5SyncGroupMaintenance;
  const preflight = await inspectTestAppDeparturePreflight(args, dependencies);
  fs.mkdirSync(args.evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(args.evidenceRoot, 'test-leave-preflight.json'),
    `${JSON.stringify({ ...preflight, inspectedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  args.markMutationBoundary?.();
  args.checked(args.paths.adb, ['-s', args.serial, 'install', '-r', args.paths.apk]);
  return maintenance({ action: 'leave-sync-group', appId: preflight.appId, buildIdentity: args.buildIdentity,
    env: args.env, evidenceRoot: args.evidenceRoot, execute: args.execute, installMain: false,
    paths: args.paths, serial: args.serial });
}
