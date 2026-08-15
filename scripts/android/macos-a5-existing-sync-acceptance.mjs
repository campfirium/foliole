import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { collectAndroidDeviceSnapshot } from './android-device-snapshot.mjs';
import { inspectPairSyncRecoveryWorkspace } from './android-pair-sync-recovery-readiness.mjs';
import { runMacosA5SyncGroupMaintenance } from './macos-a5-sync-group-maintenance-action.mjs';
import { openMacosPairSyncDesktopSession } from './macos-pair-sync-desktop-session.mjs';
import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import { MACOS_DAILY_DEBUG_ROOT, MACOS_DAILY_LIBRARY_HOME } from '../macos/macos-electron-dev-paths.mjs';

const APP_ID = 'com.foliole.android';
const COMPONENT = `${APP_ID}/.MainActivity`;

function activeMemberIds(overview) {
  return (overview.sync_group?.members ?? [])
    .filter(({ state }) => state === 'active')
    .map(({ device_id: deviceId }) => deviceId)
    .sort();
}

function hasDesktopFact(snapshot, factId) {
  return snapshot.database?.inspection?.journeyFacts?.[factId] === 'A';
}

async function waitUntil(label, inspect, accept, wait = delay) {
  const deadline = Date.now() + 5 * 60_000;
  let latest;
  while (Date.now() < deadline) {
    try {
      latest = await inspect();
    } catch (error) {
      if (!String(error?.message).includes('SqliteConnectionOwnerError')) throw error;
      await wait(1_000);
      continue;
    }
    if (accept(latest)) return latest;
    await wait(1_000);
  }
  throw new Error(`${label} did not converge.`);
}

export async function afterDesktopSyncTransaction(action, wait) {
  return waitUntil('Mac automatic sync transaction', async () => ({ value: await action() }),
    ({ value }) => value !== undefined, wait).then(({ value }) => value);
}

export async function runExistingSyncRestartJourney(actions) {
  let session;
  try {
    session = await actions.openDesktopSession();
    const before = await session.enable();
    actions.assertBaseline(before);
    const desktopFact = await actions.createDesktopFact(session);
    const androidFact = await actions.createAndroidFact();
    await actions.waitForAndroidFact(desktopFact.factId);
    await actions.waitForDesktopFact(session, androidFact.factText);
    const proof = await actions.inspectFinal(session, before, desktopFact, androidFact);
    return { androidFact, desktopFact, proof };
  } finally {
    await session?.close().catch(() => undefined);
  }
}

async function checkedDeviceAction(context, args) {
  const result = await context.execute(context.paths.adb, ['-s', context.serial, ...args], {
    env: context.env, timeoutMs: 60_000
  });
  if (result.code !== 0) throw Object.assign(new Error('A5 snapshot lifecycle failed.'), { result });
}

export async function collectStoppedAndroidSnapshot(
  context, collectSnapshot = collectAndroidDeviceSnapshot, settle = delay
) {
  await settle(90_000);
  await checkedDeviceAction(context, ['shell', 'am', 'force-stop', APP_ID]);
  try {
    return await collectSnapshot({
      adb: context.paths.adb, appId: APP_ID, includeAttachments: false,
      includeEvents: false, serial: context.serial, tables: ['nodes'],
      databaseInspector: inspectPairSyncRecoveryWorkspace
    });
  } finally {
    await checkedDeviceAction(context, ['shell', 'am', 'start', '-W', '-n', COMPONENT]);
  }
}

async function createAndroidFact({ buildIdentity, env, evidenceRoot, execute, paths, serial }) {
  const result = await runMacosA5SyncGroupMaintenance({
    action: 'create-journey-fact', buildIdentity, env,
    evidenceRoot: path.join(evidenceRoot, 'android-fact'), execute, paths, serial
  });
  const receipt = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8')).receipt;
  if (typeof receipt?.factId !== 'string' || typeof receipt?.factText !== 'string') {
    throw new Error('Android journey fact receipt is incomplete.');
  }
  return { factId: receipt.factId, factText: receipt.factText };
}

function assertBaseline(overview, readiness) {
  if (overview.sync_group?.group_id !== readiness.syncGroupId
      || overview.sync_group?.timeline_id !== readiness.syncGroupTimelineId
      || activeMemberIds(overview).length !== readiness.activeSyncGroupMemberCount) {
    throw new Error('Mac restart did not preserve the existing Sync Group baseline.');
  }
}

async function waitForDesktopFact(session, factText) {
  return waitUntil('Automatic Android-to-Mac sync', async () => session.invoke(
    'load_workspace_list_snapshot', { includePdfOpenings: false }
  ), (snapshot) => Object.values(snapshot?.nodesById ?? {}).some((node) =>
    `${node?.title ?? ''}\n${node?.content ?? ''}`.includes(factText)));
}

function validAndroidProof(snapshot, readiness, desktopFactId, androidFactId) {
  const value = snapshot.database?.inspection;
  return snapshot.database?.integrity === 'ok'
    && value?.syncGroupId === readiness.syncGroupId
    && value?.syncGroupTimelineId === readiness.syncGroupTimelineId
    && value?.activeSyncGroupMemberCount === readiness.activeSyncGroupMemberCount
    && value?.deviceIdentityFingerprint === readiness.deviceIdentityFingerprint
    && (value?.nodeCount ?? 0) >= readiness.nodeCount
    && (value?.pendingDeliveryCountsByPeerFingerprint?.[
      readiness.syncGroupRemotePeerFingerprint
    ] ?? 0) === 0
    && value?.pairingCredentialsRejected === false
    && value?.journeyFacts?.[desktopFactId] === 'A'
    && value?.journeyFacts?.[androidFactId] === 'B';
}

async function inspectFinal(session, before, desktopFact, androidFact, context) {
  const android = await waitUntil('Restarted automatic bidirectional sync',
    () => collectStoppedAndroidSnapshot(context),
    (snapshot) => validAndroidProof(
      snapshot, context.readiness, desktopFact.factId, androidFact.factId
    ));
  const overview = await session.load();
  const desktop = await session.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
  if (overview.sync_group?.group_id !== context.readiness.syncGroupId
      || overview.sync_group?.timeline_id !== context.readiness.syncGroupTimelineId
      || JSON.stringify(activeMemberIds(overview)) !== JSON.stringify(activeMemberIds(before))
      || !desktop?.nodesById?.[desktopFact.factId]
      || !Object.values(desktop?.nodesById ?? {}).some((node) =>
        `${node?.title ?? ''}\n${node?.content ?? ''}`.includes(androidFact.factText))) {
    throw new Error('Mac restart did not preserve bidirectional Sync Group convergence.');
  }
  return { activeMemberIds: activeMemberIds(overview), android: android.database.inspection,
    groupId: overview.sync_group.group_id, macRestarted: true, androidRestarted: true,
    timelineId: overview.sync_group.timeline_id };
}

export async function proveMacosA5ExistingSyncContinuation({
  buildIdentity, env, evidenceRoot, execute, paths, readiness, serial
}) {
  const context = { env, execute, paths, readiness, serial };
  const sessionOptions = {
    env, libraryHome: MACOS_DAILY_LIBRARY_HOME, repoRoot: paths.repoRoot,
    userDataPath: path.join(paths.repoRoot, MACOS_DAILY_DEBUG_ROOT, 'user-data')
  };
  const result = await runExistingSyncRestartJourney({
    assertBaseline: (overview) => assertBaseline(overview, readiness),
    createAndroidFact: () => createAndroidFact({
      buildIdentity, env, evidenceRoot, execute, paths, serial
    }),
    createDesktopFact: (session) => afterDesktopSyncTransaction(
      () => createDesktopSyncGroupJourneyFact({
        device: 'A', evidenceRoot: path.join(evidenceRoot, 'mac-fact'), session
      })
    ),
    inspectFinal: (...args) => inspectFinal(...args, context),
    openDesktopSession: () => openMacosPairSyncDesktopSession(sessionOptions),
    waitForAndroidFact: (factId) => waitUntil('Automatic Mac-to-Android sync',
      () => collectStoppedAndroidSnapshot(context), (snapshot) => hasDesktopFact(snapshot, factId)),
    waitForDesktopFact
  });
  const manifestPath = path.join(evidenceRoot, 'existing-sync-continuation-manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    buildIdentity, completedAt: new Date().toISOString(), facts: {
      android: result.androidFact.factId, mac: result.desktopFact.factId
    }, proof: result.proof, resultStatus: 'success', schemaVersion: 1
  }, null, 2)}\n`, 'utf8');
  return { manifestPath, proof: result.proof };
}
