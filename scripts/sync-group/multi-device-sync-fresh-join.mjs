import fs from 'node:fs';
import path from 'node:path';

import { macosA5GradleEnv, macosA5Paths, A5_SERIAL } from '../android/macos-a5-dev.mjs';
import {
  runMacosA5InstrumentationMechanics
} from '../android/macos-a5-sync-group-maintenance-action.mjs';
import { runMacosA5SyncGroupMaintenance } from './a5-sync-group-action.mjs';
import {
  openMacosSyncGroupDesktopSession, waitForMacosDeviceRequest
} from '../android/macos-sync-group-desktop-session.mjs';
import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import { waitForAndroidJourneyFact } from './multi-device-sync-ab-convergence.mjs';
import {
  macosAcceptanceEnv, macosAcceptanceSessionOptions
} from './multi-device-sync-macos-channel.mjs';
import { createIsolatedMacosRoot } from './multi-device-sync-workspace.mjs';
import {
  assertFreshJoinInitialConvergence, factObservation
} from './sync-scenario-predicate.mjs';

const APP_ID = 'com.foliole.android';
const JOIN_TEST = `${APP_ID}.FolioleCompanionSyncGroupJoinTest`;

async function checked(execute, command, args, options, stage) {
  const result = await execute(command, args, options);
  if (result.code === 0) return result;
  throw Object.assign(new Error(`${stage} failed`), { failureOwner: 'controller',
    host: 'android-b', missingFact: stage, result });
}

async function createInitialFact({ evidenceRoot, session }) {
  return createDesktopSyncGroupJourneyFact({ device: 'A',
    evidenceRoot: path.join(evidenceRoot, 'initial-fact'), session });
}

async function restartAndroid(execute, paths, env) {
  await checked(execute, paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'force-stop', APP_ID],
    { env, timeoutMs: 30_000 }, 'android_restart_stop');
  await checked(execute, paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'start', '-W', '-n',
    `${APP_ID}/.MainActivity`], { env, timeoutMs: 60_000 }, 'android_restart_start');
}

export async function performFreshJoinSequence({
  createFact, pair, receive, receiveAfterRestart, restart, syncNow
}) {
  const mutationFact = await createFact();
  const pairResult = await pair();
  const received = await syncNow(mutationFact.factId,
    () => receive(mutationFact.factId));
  await restart();
  const restarted = await receiveAfterRestart(mutationFact.factId);
  return { mutationFact, pairResult, received, restarted };
}

async function runFreshJoinInitialSync({
  buildIdentity, env, evidenceRoot, execute, observe, paths
}) {
  const result = await runMacosA5SyncGroupMaintenance({ action: 'sync-now', buildIdentity, env,
    evidenceRoot: path.join(evidenceRoot, 'initial-sync'), execute, installMain: false,
    observeWhileTransportOpen: observe, paths, serial: A5_SERIAL });
  return result.observation;
}

function validateJoin({ evidencePath, stdout }) {
  if (/folioleSyncGroupJoinReceipt=.*"joined":true.*"restarted":true/u.test(stdout)
      && /INSTRUMENTATION_CODE: -1/mu.test(stdout)) return;
  throw Object.assign(new Error('A5 Device join and restart evidence is incomplete.'), {
    evidenceRef: evidencePath, missingFact: 'a5_device_join_persistence'
  });
}

async function joinA5({ buildIdentity, env, evidenceRoot, execute, paths, session }) {
  return runMacosA5InstrumentationMechanics({ buildIdentity, env,
    evidenceRoot: path.join(evidenceRoot, 'device-join'), execute, installMain: false,
    observeConcurrently: true, paths, serial: A5_SERIAL, testClass: JOIN_TEST,
    validateInstrumentation: validateJoin,
    observeWhileTransportOpen: async (options) => {
      const request = await waitForMacosDeviceRequest(session, null, options);
      await session.accept(request.request_id);
      const overview = await session.load();
      if (overview.sync_group?.devices?.length !== 2) {
        throw new Error('Mac did not persist A5 as the second Device.');
      }
      return { groupId: overview.sync_group.group_id, requestId: request.request_id };
    } });
}

export async function establishFreshAB({ execute, reportProgress, repoRoot, runId }) {
  const owned = createIsolatedMacosRoot({ repoRoot, runId });
  const paths = macosA5Paths(repoRoot);
  const env = macosAcceptanceEnv(macosA5GradleEnv());
  const evidenceRoot = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs', runId,
    'a-b-group-sync');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const sessionOptions = macosAcceptanceSessionOptions({
    libraryHome: path.join(owned.root, 'library'), repoRoot,
    runtimeRoot: owned.root
  });
  const session = await openMacosSyncGroupDesktopSession(sessionOptions);
  await session.enable();
  let journey;
  try { journey = await performFreshJoinSequence({
    createFact: () => createInitialFact({ evidenceRoot, session }),
    pair: async () => {
      const result = await joinA5({ buildIdentity: runId, env, evidenceRoot, execute,
        paths, session });
      reportProgress('macos-group-created'); reportProgress('a5-paired');
      return result;
    },
    receive: (factId) => waitForAndroidJourneyFact(paths, factId),
    receiveAfterRestart: (factId) => waitForAndroidJourneyFact(paths, factId),
    restart: () => restartAndroid(execute, paths, env),
    syncNow: (_factId, observe) => runFreshJoinInitialSync({ buildIdentity: runId, env,
      evidenceRoot, execute, observe, paths })
  }); } finally { await session.close().catch(() => undefined); }
  const { mutationFact, pairResult, received, restarted } = journey;
  const mutation = { factId: mutationFact.factId, origin: 'A', runId };
  const proof = assertFreshJoinInitialConvergence({ mutation,
    received: factObservation(received.database?.inspection?.journeyFacts),
    restarted: factObservation(restarted.database?.inspection?.journeyFacts) });
  reportProgress('a-b-synced');
  const evidenceRef = path.join(evidenceRoot, 'fresh-join-convergence.json');
  fs.writeFileSync(evidenceRef, `${JSON.stringify({ completedAt: new Date().toISOString(),
    joinEvidenceRef: pairResult.evidencePath, proof,
    resultStatus: 'success', schemaVersion: 1
  }, null, 2)}\n`, 'utf8');
  return { evidenceRef };
}
