import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { collectAndroidDeviceSnapshot } from '../android/android-device-snapshot.mjs';
import { inspectPairSyncRecoveryWorkspace } from '../android/android-pair-sync-recovery-readiness.mjs';
import { macosA5GradleEnv, macosA5Paths, A5_SERIAL } from '../android/macos-a5-dev.mjs';
import { openMacosPairSyncDesktopSession } from '../android/macos-pair-sync-desktop-session.mjs';
import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import {
  assertDesktopDepartureData, assertParticipationState, desktopFactObservation
} from './multi-device-sync-participation-evidence.mjs';
import {
  restartAndroidParticipant, runParticipantMaintenance
} from './multi-device-sync-participation-runtime.mjs';
import { macosAcceptanceEnv, macosAcceptanceSessionOptions } from './multi-device-sync-macos-channel.mjs';
import { startWindowsSyncGroupProvider } from './multi-device-sync-windows-provider.mjs';
import { createIsolatedMacosRoot } from './multi-device-sync-workspace.mjs';
import {
  assertPauseResumeContinuity, factObservation
} from './sync-scenario-predicate.mjs';

/* global process */

const APP_ID = 'com.foliole.android';

function productFailure(host, missingFact, message) {
  return Object.assign(new Error(message), { failureOwner: 'product', host, missingFact });
}

async function waitUntil(label, inspect, accept, missingFact, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let value;
  while (Date.now() < deadline) {
    value = await inspect();
    if (accept(value)) return value;
    await delay(1_000);
  }
  throw productFailure('all', missingFact, `${label} did not converge: ${JSON.stringify(value)}`);
}

function androidSnapshot(paths) {
  return collectAndroidDeviceSnapshot({ adb: paths.adb, appId: APP_ID,
    includeAttachments: false, includeEvents: false,
    serial: A5_SERIAL, tables: ['attachments', 'content_blobs', 'nodes'],
    databaseInspector: (database) => ({ ...inspectPairSyncRecoveryWorkspace(database),
      syncDeliveryReceiptCount: Number(database.prepare(
        'SELECT COUNT(*) AS value FROM sync_delivery_receipts').get()?.value ?? 0),
      syncPeerCursorCount: Number(database.prepare(
        'SELECT COUNT(*) AS value FROM sync_peer_cursors').get()?.value ?? 0) }) });
}

async function macosFacts(execute, repoRoot, databasePath, factIds = []) {
  const electron = path.join(repoRoot, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
  const inspector = path.join(repoRoot, 'scripts/windows/windows-sync-group-recovery-inspect.mjs');
  const result = await execute(electron, [inspector, databasePath, ...factIds], {
    cwd: repoRoot, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeoutMs: 30_000
  });
  if (result.code !== 0) throw new Error('macOS A database inspection failed.');
  return JSON.parse(result.stdout.trim());
}

async function newestAndroidFact(context, origin, excluded) {
  const snapshot = await androidSnapshot(context.paths);
  const ids = Object.entries(snapshot.database?.inspection?.journeyFacts ?? {})
    .filter(([id, value]) => value === origin && !excluded.has(id)).map(([id]) => id);
  if (ids.length !== 1) throw productFailure('android-b', 'android_offline_fact_identity_invalid',
    `Android produced ${ids.length} fresh ${origin} facts.`);
  return ids[0];
}

async function proveMacosParticipation(context) {
  let session = await context.openSession();
  const initial = await session.load();
  const groupId = initial.sync_group?.group_id;
  if (!groupId || initial.sync_group.members.filter(({ state }) => state === 'active').length !== 3) {
    throw productFailure('macos-a', 'macos_three_member_input_missing', 'macOS three-member input is missing.');
  }
  const androidBefore = await androidSnapshot(context.paths);
  const excluded = new Set(Object.keys(androidBefore.database?.inspection?.journeyFacts ?? {}));
  await session.invoke('pause_companion_sync');
  await session.close();
  await runParticipantMaintenance(context, 'create-journey-fact', 'macos-offline-b-fact');
  const factId = await newestAndroidFact(context, 'B', excluded);
  const paused = await context.inspectMac([factId]);
  session = await context.openSession();
  assertParticipationState(await session.load(), { enabled: true, paused: true }, groupId,
    (message) => productFailure('macos-a', 'macos_participation_state_invalid', message));
  context.reportProgress('macos-pause-persisted');
  await session.invoke('resume_companion_sync');
  const resumed = await waitUntil('macOS resumed cursor', () => context.inspectMac([factId]),
    (facts) => facts.facts?.[factId] === true, 'macos_resume_cursor_missing');
  context.reportProgress('macos-resumed-cursor');
  await session.close();
  session = await context.openSession();
  const restarted = await context.inspectMac([factId]);
  assertPauseResumeContinuity({ mutation: { factId, origin: 'B', runId: context.runId },
    paused: desktopFactObservation(paused, factId, 'B'),
    resumed: desktopFactObservation(resumed, factId, 'B'),
    restarted: desktopFactObservation(restarted, factId, 'B') });
  await session.invoke('disable_companion_sync');
  await session.close();
  session = await context.openSession();
  assertParticipationState(await session.load(), { enabled: false, paused: false }, groupId,
    (message) => productFailure('macos-a', 'macos_participation_state_invalid', message));
  context.reportProgress('macos-sync-off-persisted');
  await session.invoke('enable_companion_sync');
  return { factId, groupId, session };
}

async function proveAndroidParticipation(context, macosSession) {
  await runParticipantMaintenance(context, 'control-participation', 'android-control');
  context.reportProgress('android-sync-off-persisted');
  await runParticipantMaintenance(context, 'pause-participation', 'android-pause');
  context.reportProgress('android-pause-persisted');
  const fact = await createDesktopSyncGroupJourneyFact({ device: 'A',
    evidenceRoot: path.join(context.evidenceRoot, 'android-offline-a-fact'), session: macosSession });
  const paused = await androidSnapshot(context.paths);
  await runParticipantMaintenance(context, 'resume-participation', 'android-resume');
  const after = await waitUntil('Android resumed cursor', () => androidSnapshot(context.paths),
    (snapshot) => snapshot.database?.inspection?.journeyFacts?.[fact.factId] === 'A',
    'android_resume_cursor_missing');
  context.reportProgress('android-resumed-cursor');
  await restartAndroidParticipant({ appId: APP_ID, context, serial: A5_SERIAL });
  const restarted = await waitUntil('Android restarted continuity', () => androidSnapshot(context.paths),
    (snapshot) => snapshot.database?.inspection?.journeyFacts?.[fact.factId] === 'A',
    'android_restart_continuity_missing');
  assertPauseResumeContinuity({ mutation: {
    factId: fact.factId, origin: 'A', runId: context.runId
  }, paused: factObservation(paused.database?.inspection?.journeyFacts),
    resumed: factObservation(after.database?.inspection?.journeyFacts),
    restarted: factObservation(restarted.database?.inspection?.journeyFacts) });
  const excluded = new Set(Object.keys(after.database?.inspection?.journeyFacts ?? {}));
  await runParticipantMaintenance(context, 'create-journey-fact', 'android-post-resume-route-fact');
  const routeFactId = await newestAndroidFact(context, 'B', excluded);
  await waitUntil('macOS consumes Android post-resume route fact',
    () => context.inspectMac([routeFactId]), (facts) => facts.facts?.[routeFactId] === true,
    'android_post_resume_route_missing');
  return androidSnapshot(context.paths);
}

async function leaveAndroid(context, before) {
  await runParticipantMaintenance(context, 'pause-and-leave', 'android-paused-leave');
  context.reportProgress('android-left-while-paused');
  await context.execute(context.paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'start', '-n',
    `${APP_ID}/.MainActivity`], { env: context.env, timeoutMs: 30_000 });
  await delay(1_000);
  const after = await androidSnapshot(context.paths);
  const inspection = after.database?.inspection;
  if (inspection?.syncGroupId !== null || inspection?.syncPeerCursorCount !== 0
      || inspection?.syncDeliveryReceiptCount !== 0
      || after.database.counts.nodes !== before.database.counts.nodes
      || after.database.counts.content_blobs !== before.database.counts.content_blobs
      || after.database.counts.attachments !== before.database.counts.attachments) {
    throw productFailure('android-b', 'android_departure_cleanup_invalid',
      `Android departed state is incomplete: ${JSON.stringify(after.database)}`);
  }
  return after;
}

async function leaveMacos(context, session) {
  const before = await context.inspectMac();
  await session.invoke('disable_companion_sync');
  const left = await session.leave();
  if (left.sync_group !== null || left.sync_enabled !== false) {
    throw productFailure('macos-a', 'macos_leave_while_disabled_failed', 'macOS Leave did not unbind.');
  }
  context.reportProgress('macos-left-while-sync-off');
  await session.close();
  const restarted = await context.openSession();
  try {
    const overview = await restarted.load();
    const after = await context.inspectMac();
    assertDesktopDepartureData(before, after, overview, (message) =>
      productFailure('macos-a', 'macos_departure_cleanup_invalid', message));
  } finally { await restarted.close(); }
}

function createContext(options) {
  const { execute, reportProgress, repoRoot, runId } = options;
  const owned = createIsolatedMacosRoot({ repoRoot, runId });
  const databasePath = path.join(owned.root, 'library', 'Data', 'foliole.db');
  const evidenceRoot = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs', runId,
    'participation-control');
  const env = macosAcceptanceEnv(macosA5GradleEnv());
  return { databasePath, env, evidenceRoot, execute,
    inspectMac: (ids) => macosFacts(execute, repoRoot, databasePath, ids),
    openSession: () => openMacosPairSyncDesktopSession(macosAcceptanceSessionOptions({ env,
      libraryHome: path.join(owned.root, 'library'), repoRoot,
      userDataPath: path.join(owned.root, 'user-data') })),
    paths: macosA5Paths(repoRoot), reportProgress, repoRoot, runId, serial: A5_SERIAL };
}

export async function proveParticipationControl(options) {
  const context = createContext(options);
  fs.mkdirSync(context.evidenceRoot, { recursive: true });
  const windows = startWindowsSyncGroupProvider({ action: 'multi-device-sync-participation',
    execute: context.execute, reportProgress: context.reportProgress, repoRoot: context.repoRoot });
  let settled = false;
  let macos;
  try {
    macos = await proveMacosParticipation(context);
    await windows.waitForProgress();
    const windowsFact = await createDesktopSyncGroupJourneyFact({ device: 'A',
      evidenceRoot: path.join(context.evidenceRoot, 'windows-offline-a-fact'), session: macos.session });
    await windows.release('consumer_complete');
    const androidBeforeLeave = await proveAndroidParticipation(context, macos.session);
    await leaveMacos(context, macos.session);
    macos.session = null;
    await waitUntil('Android observes macOS departure', () => androidSnapshot(context.paths),
      (snapshot) => snapshot.database?.inspection?.activeSyncGroupMemberCount === 2,
      'android_macos_departure_missing');
    await windows.waitForProgress('macos-departure-observed');
    const androidAfterLeave = await leaveAndroid(context, androidBeforeLeave);
    const remote = await windows.finish();
    settled = true;
    context.reportProgress('windows-resumed-cursor');
    context.reportProgress('windows-sync-off-persisted');
    context.reportProgress('windows-last-member-left');
    context.reportProgress('all-restarted-unbound');
    const evidenceRef = path.join(context.evidenceRoot, 'participation-control-proof.json');
    fs.writeFileSync(evidenceRef, `${JSON.stringify({ androidAfterLeave, completedAt: new Date().toISOString(),
      macosOfflineFactId: macos.factId, resultStatus: 'success', schemaVersion: 1,
      windowsEvidenceRef: remote.evidenceRef, windowsOfflineFactId: windowsFact.factId
    }, null, 2)}\n`, 'utf8');
    return { evidenceRef };
  } finally {
    await macos?.session?.close().catch(() => undefined);
    if (!settled) await windows.cancelAndSettle();
  }
}
