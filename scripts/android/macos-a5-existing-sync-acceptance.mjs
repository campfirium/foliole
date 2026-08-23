import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { collectAndroidDeviceSnapshot } from './android-device-snapshot.mjs';
import { inspectPairSyncRecoveryWorkspace } from './android-pair-sync-recovery-readiness.mjs';
import { runMacosA5SyncGroupMaintenance } from './macos-a5-sync-group-maintenance-action.mjs';
import { openMacosPairSyncDesktopSession } from './macos-pair-sync-desktop-session.mjs';
import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import {
  assertBidirectionalConvergence, factObservation
} from '../sync-group/sync-scenario-predicate.mjs';

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
    const androidReceived = await actions.waitForAndroidFact(desktopFact.factId);
    const desktopReceived = await actions.waitForDesktopFact(session, androidFact.factId);
    await session.close();
    session = null;
    await actions.restartAndroid();
    session = await actions.openDesktopSession();
    await session.enable();
    const proof = await actions.inspectFinal(session, before, desktopFact, androidFact, {
      androidReceived, desktopReceived
    });
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
  context, collectSnapshot = collectAndroidDeviceSnapshot
) {
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

async function waitForDesktopFact(session, factId) {
  return waitUntil('Automatic Android-to-Mac sync', async () => session.invoke(
    'load_workspace_list_snapshot', { includePdfOpenings: false }
  ), (snapshot) => Boolean(snapshot?.nodesById?.[factId]));
}

function validAndroidProof(snapshot, desktopFactId, androidFactId) {
  const value = snapshot.database?.inspection;
  return value?.journeyFacts?.[desktopFactId] === 'A'
    && value?.journeyFacts?.[androidFactId] === 'B';
}

function desktopObservation(snapshot, desktopFact, androidFact) {
  return factObservation({
    ...(snapshot?.nodesById?.[desktopFact.factId] ? { [desktopFact.factId]: 'A' } : {}),
    ...(snapshot?.nodesById?.[androidFact.factId] ? { [androidFact.factId]: 'B' } : {})
  });
}

async function inspectFinal(session, _before, desktopFact, androidFact, received, context) {
  const android = await waitUntil('Restarted automatic bidirectional sync',
    () => collectStoppedAndroidSnapshot(context),
    (snapshot) => validAndroidProof(snapshot, desktopFact.factId, androidFact.factId));
  const desktop = await session.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
  const mutations = [
    { factId: desktopFact.factId, origin: 'A', runId: context.buildIdentity },
    { factId: androidFact.factId, origin: 'B', runId: context.buildIdentity }
  ];
  const androidFacts = factObservation(android.database?.inspection?.journeyFacts);
  const desktopFacts = desktopObservation(desktop, desktopFact, androidFact);
  return assertBidirectionalConvergence({ mutations, observations: {
    received: [desktopObservation(received.desktopReceived, desktopFact, androidFact),
      factObservation(received.androidReceived.database?.inspection?.journeyFacts)],
    restarted: [desktopFacts, androidFacts]
  } });
}

export async function proveMacosA5ExistingSyncContinuation({
  buildIdentity, env, evidenceRoot, execute, paths, readiness, serial
}) {
  const context = { buildIdentity, env, execute, paths, readiness, serial };
  const sessionOptions = {
    env, libraryHome: paths.desktopDevLibrary, repoRoot: paths.buildRoot,
    runtimeRoot: paths.desktopRuntimeRoot
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
    restartAndroid: async () => {
      await checkedDeviceAction(context, ['shell', 'am', 'force-stop', APP_ID]);
      await checkedDeviceAction(context, ['shell', 'am', 'start', '-W', '-n', COMPONENT]);
    },
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
