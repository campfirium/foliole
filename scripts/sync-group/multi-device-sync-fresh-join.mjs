import fs from 'node:fs';
import path from 'node:path';

import { macosA5GradleEnv, macosA5Paths, A5_SERIAL } from '../android/macos-a5-dev.mjs';
import { runMacosA5PairSync } from '../android/macos-a5-pair-sync-action.mjs';
import { runMacosA5SyncGroupMaintenance } from './a5-sync-group-action.mjs';
import { openMacosPairSyncDesktopSession } from '../android/macos-pair-sync-desktop-session.mjs';
import { resolveMacosA5PairSyncReadiness } from '../android/macos-a5-product-bootstrap.mjs';
import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import { waitForAndroidJourneyFact } from './multi-device-sync-ab-convergence.mjs';
import {
  closeMacosAcceptanceTransport, macosAcceptanceEnv, macosAcceptanceSessionOptions,
  openMacosAcceptanceTransport, validateMacosAcceptanceDesktopPreflight
} from './multi-device-sync-macos-channel.mjs';
import { createIsolatedMacosRoot } from './multi-device-sync-workspace.mjs';
import {
  assertFreshJoinInitialConvergence, factObservation
} from './sync-scenario-predicate.mjs';

const APP_ID = 'com.foliole.android';

async function checked(execute, command, args, options, stage) {
  const result = await execute(command, args, options);
  if (result.code === 0) return result;
  throw Object.assign(new Error(`${stage} failed`), { failureOwner: 'controller',
    host: 'android-b', missingFact: stage, result });
}

async function createInitialFact({ evidenceRoot, sessionOptions }) {
  const session = await openMacosPairSyncDesktopSession(sessionOptions);
  try {
    await session.enable();
    return createDesktopSyncGroupJourneyFact({ device: 'A',
      evidenceRoot: path.join(evidenceRoot, 'initial-fact'), session });
  } finally { await session.close().catch(() => undefined); }
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
  buildIdentity, env, evidenceRoot, execute, observe, paths, sessionOptions
}) {
  const session = await openMacosPairSyncDesktopSession(sessionOptions);
  try {
    await session.enable();
    const result = await runMacosA5SyncGroupMaintenance({ action: 'sync-now', buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'initial-sync'), execute, installMain: false,
      observeWhileTransportOpen: observe, paths, serial: A5_SERIAL });
    return result.observation;
  } finally { await session.close().catch(() => undefined); }
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
  const journey = await performFreshJoinSequence({
    createFact: () => createInitialFact({ evidenceRoot, sessionOptions }),
    pair: async () => {
      const readiness = resolveMacosA5PairSyncReadiness(paths);
      if (readiness.existingPairing) {
        throw Object.assign(new Error('Fresh join requires an unpaired fixed A5 baseline.'), {
          failureOwner: 'candidate', host: 'android-b', missingFact: 'fresh_join_baseline'
        });
      }
      const result = await runMacosA5PairSync({ buildIdentity: runId,
        credentialRepairRequired: readiness.credentialRepairRequired,
        desktopControl: async () => ({ code: 0, output: '' }),
        desktopAuthorizationFingerprint: readiness.syncGroupRemotePeerFingerprint,
        env, evidenceRoot, execute, hostName: readiness.hostName, existingPairing: false,
        libraryHome: path.join(owned.root, 'library'), openTransport: openMacosAcceptanceTransport,
        closeTransport: closeMacosAcceptanceTransport,
        pairedAuthorizationFingerprint: readiness.localMemberAuthorizationFingerprint,
        paths, runtimeRoot: owned.root, serial: A5_SERIAL,
        validateDesktop: validateMacosAcceptanceDesktopPreflight });
      reportProgress('macos-group-created'); reportProgress('a5-paired');
      return result;
    },
    receive: (factId) => waitForAndroidJourneyFact(paths, factId),
    receiveAfterRestart: (factId) => waitForAndroidJourneyFact(paths, factId),
    restart: () => restartAndroid(execute, paths, env),
    syncNow: (_factId, observe) => runFreshJoinInitialSync({ buildIdentity: runId, env,
      evidenceRoot, execute, observe, paths, sessionOptions })
  });
  const { mutationFact, pairResult, received, restarted } = journey;
  const mutation = { factId: mutationFact.factId, origin: 'A', runId };
  const proof = assertFreshJoinInitialConvergence({ mutation,
    received: factObservation(received.database?.inspection?.journeyFacts),
    restarted: factObservation(restarted.database?.inspection?.journeyFacts) });
  reportProgress('a-b-synced');
  const evidenceRef = path.join(evidenceRoot, 'fresh-join-convergence.json');
  fs.writeFileSync(evidenceRef, `${JSON.stringify({ completedAt: new Date().toISOString(),
    pairEvidenceRef: pairResult.pairSyncRecovery.manifestPath, proof,
    resultStatus: 'success', schemaVersion: 1
  }, null, 2)}\n`, 'utf8');
  return { evidenceRef };
}
