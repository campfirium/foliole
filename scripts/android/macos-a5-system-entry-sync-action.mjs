/* global console */

import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { collectAndroidDeviceSnapshot } from './android-device-snapshot.mjs';
import { inspectPairSyncRecoveryWorkspace } from './android-pair-sync-recovery-readiness.mjs';
import { inspectA5SystemEntryDisplayName } from './macos-a5-system-entry-display-inspection.mjs';
import { buildMacosA5Desktop } from './macos-a5-extended-actions.mjs';
import { openMacosPairSyncDesktopSession } from './macos-pair-sync-desktop-session.mjs';

const APP_ID = 'com.foliole.android';
const ALIAS = 'T143 Synced Inbox';
const SETTING_KEY = 'system_entry_display_names';

function inspectSystemEntryDisplayNames(database) {
  const row = database.prepare(`SELECT value_json FROM setting_records
    WHERE key = ? AND scope = 'user_space' AND platform = 'windows'
      AND form_factor = 'desktop' AND host_name = '*'`).get(SETTING_KEY);
  return {
    ...inspectPairSyncRecoveryWorkspace(database),
    systemEntryDisplayNames: row ? JSON.parse(row.value_json) : null
  };
}

function samePayload(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function waitForA5Payload(context, expected, collectSnapshot = collectAndroidDeviceSnapshot) {
  const deadline = Date.now() + 5 * 60_000;
  let latest;
  while (Date.now() < deadline) {
    latest = await collectSnapshot({
      adb: context.paths.adb, appId: APP_ID, databaseInspector: inspectSystemEntryDisplayNames,
      includeAttachments: false, includeEvents: false, serial: context.serial,
      tables: ['setting_records', 'sync_object_state']
    });
    const inspection = latest.database?.inspection;
    if (latest.database?.integrity === 'ok'
        && samePayload(inspection?.systemEntryDisplayNames, expected)
        && inspection?.pairingCredentialsRejected === false) return latest;
    await delay(2_000);
  }
  throw Object.assign(new Error('A5 system entry display names did not converge.'), { latest });
}

async function checkedA5Lifecycle(context, args) {
  const result = await context.execute(context.paths.adb, [
    '-s', context.serial, 'shell', 'am', ...args
  ], { env: context.env, timeoutMs: 60_000 });
  if (result.code !== 0) throw Object.assign(new Error('A5 restart failed.'), { result });
}

export async function restartA5(context) {
  await checkedA5Lifecycle(context, ['force-stop', APP_ID]);
  await checkedA5Lifecycle(context, ['start', '-W', '-n', `${APP_ID}/.MainActivity`]);
}

function sessionOptions(context) {
  return { env: context.env, libraryHome: context.paths.desktopDevLibrary,
    repoRoot: context.paths.buildRoot, runtimeRoot: context.paths.desktopRuntimeRoot };
}

async function inspectDisplay(context, name, options) {
  return inspectA5SystemEntryDisplayName({
    buildIdentity: context.buildIdentity, env: context.env,
    evidenceRoot: path.join(context.evidenceRoot, name), execute: context.execute,
    paths: context.paths, serial: context.serial, ...options
  });
}

function conciseSnapshot(snapshot) {
  const value = snapshot.database.inspection;
  return { activeSyncGroupMemberCount: value.activeSyncGroupMemberCount,
    dirtyRecordCount: value.dirtyRecordCount, integrity: snapshot.database.integrity,
    systemEntryDisplayNames: value.systemEntryDisplayNames };
}

export async function proveA5SystemEntryDisplayNameConvergence(context) {
  let session = await openMacosPairSyncDesktopSession(sessionOptions(context));
  try {
    await session.enable();
    const baseline = await session.invoke('load_system_entry_display_names');
    if (baseline?.customDisplayNameById?.inbox) {
      throw new Error('Isolated A5 controller library already has an Inbox display alias.');
    }
    const baselineDisplay = await inspectDisplay(context, 'baseline-display', {
      forbiddenText: ALIAS
    });
    const baselineSnapshot = await waitForA5Payload(context, baseline);
    const renamed = { customDisplayNameById: {
      ...baseline.customDisplayNameById, inbox: ALIAS
    }, version: 1 };
    await session.invoke('save_system_entry_display_names', { payload: renamed });
    await restartA5(context);
    const renamedDisplay = await inspectDisplay(context, 'renamed-display', { expectedText: ALIAS });
    const renamedSnapshot = await waitForA5Payload(context, renamed);

    await restartA5(context);
    await session.invoke('save_system_entry_display_names', { payload: baseline });
    const restoredDisplay = await inspectDisplay(context, 'restored-display', { forbiddenText: ALIAS });
    const restoredSnapshot = await waitForA5Payload(context, baseline);
    await session.close();
    session = await openMacosPairSyncDesktopSession(sessionOptions(context));
    await session.enable();
    const desktopAfterRestart = await session.invoke('load_system_entry_display_names');
    if (!samePayload(desktopAfterRestart, baseline)) {
      throw new Error('Desktop system entry display names changed after restart.');
    }
    return { baseline, baselineDisplay: baselineDisplay.actionReceipt,
      baselineSnapshot: conciseSnapshot(baselineSnapshot), desktopAfterRestart,
      renamed: conciseSnapshot(renamedSnapshot), renamedDisplay: renamedDisplay.actionReceipt,
      restored: conciseSnapshot(restoredSnapshot), restoredDisplay: restoredDisplay.actionReceipt };
  } finally {
    await session?.close().catch(() => undefined);
  }
}

export async function runMacosA5SystemEntrySyncEntry(args) {
  args.assertFixed();
  const { runMacosA5ExistingSyncPreflight } = await import('./macos-a5-pair-sync-preflight.mjs');
  const readiness = runMacosA5ExistingSyncPreflight(args.paths);
  args.build();
  buildMacosA5Desktop(args.checked, args.paths);
  const buildIdentity = args.buildIdentity();
  args.markMutationBoundary?.();
  const evidenceRoot = path.join(args.paths.artifactsRoot, 'a5-system-entry-sync', buildIdentity);
  await args.protectData('backup', path.join(evidenceRoot, 'baseline.json'),
    path.join(args.paths.deviceBackupRoot, buildIdentity));
  args.checked(args.paths.adb, ['-s', args.serial, 'install', '-r', args.paths.apk]);
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const proof = await proveA5SystemEntryDisplayNameConvergence({
    buildIdentity, env: args.env, evidenceRoot, execute: args.execute,
    paths: args.paths, readiness, serial: args.serial
  });
  const manifestPath = path.join(evidenceRoot, 'system-entry-sync-manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify({ buildIdentity,
    completedAt: new Date().toISOString(), proof, resultStatus: 'success', schemaVersion: 1
  }, null, 2)}\n`, 'utf8');
  console.log(`[macos-a5-dev] system-entry-sync evidence=${manifestPath}`);
}
