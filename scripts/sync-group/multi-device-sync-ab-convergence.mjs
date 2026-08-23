import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { inspectPairSyncRecoveryWorkspace } from '../android/android-pair-sync-recovery-readiness.mjs';
import { collectAndroidDeviceSnapshot } from '../android/android-device-snapshot.mjs';
import { macosA5GradleEnv, macosA5Paths, A5_SERIAL } from '../android/macos-a5-dev.mjs';
import { startMacosA5SyncGroupApprovalProvider } from '../android/macos-a5-sync-group-approval.mjs';
import { runMacosA5SyncGroupMaintenance } from '../android/macos-a5-sync-group-maintenance-action.mjs';
import { openMacosPairSyncDesktopSession } from '../android/macos-pair-sync-desktop-session.mjs';
import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import {
  closeMacosAcceptanceTransport, macosAcceptanceEnv, macosAcceptanceSessionOptions,
  openMacosAcceptanceTransport
} from './multi-device-sync-macos-channel.mjs';
import { createIsolatedMacosRoot } from './multi-device-sync-workspace.mjs';
import {
  assertBidirectionalConvergence, factObservation
} from './sync-scenario-predicate.mjs';

const APP_ID = 'com.foliole.android';

export async function runABConvergenceJourney(actions) {
  let session;
  let transportOpen = false;
  try {
    session = await actions.openSession();
    const listener = await session.enable();
    if (listener.sync_enabled !== true || listener.server_status?.state !== 'running') {
      throw productFailure('macos-a', 'a_product_listener_unavailable', 'MacOS A sync listener is unavailable.');
    }
    const desktopFact = await actions.createDesktopFact(session);
    await actions.stopAndroid();
    await actions.openTransport();
    transportOpen = true;
    await actions.startAndroid();
    const androidReceived = await actions.waitForAndroidFact(desktopFact.factId);
    actions.reportProgress?.('a-fact-synced-to-b');
    await actions.closeTransport();
    transportOpen = false;
    const androidFact = await actions.createAndroidFact();
    const desktopReceived = await actions.waitForDesktopFact(session, androidFact.factId);
    actions.reportProgress?.('b-fact-synced-to-a');
    await session.close();
    session = null;
    await actions.restartAndroid();
    actions.reportProgress?.('a-b-restarted');
    session = await actions.openSession();
    const proof = await actions.inspectRestarted(session, desktopFact, androidFact, {
      androidReceived, desktopReceived
    });
    actions.reportProgress?.('a-b-bidirectional-converged');
    return { androidFact, desktopFact, proof };
  } finally {
    if (transportOpen) await actions.closeTransport().catch(() => undefined);
    await session?.close().catch(() => undefined);
  }
}

export async function waitForAndroidJourneyFact(paths, factId, expectedDevice = 'A', wait = delay) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const snapshot = await androidSnapshot(paths, factId, null, expectedDevice);
    if (snapshot.database?.inspection?.desktopFactPresent) return snapshot;
    await wait(1_000);
  }
  throw productFailure('android-b', `deterministic_${expectedDevice.toLowerCase()}_fact_missing`,
    `Android B did not receive the deterministic ${expectedDevice} fact.`, 'stalled');
}

export async function proveABConvergence({ execute, reportProgress, repoRoot, runId }) {
  const owned = createIsolatedMacosRoot({ repoRoot, runId });
  const paths = macosA5Paths(repoRoot);
  const env = macosAcceptanceEnv(macosA5GradleEnv());
  const evidenceRoot = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs', runId,
    'a-b-convergence');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const runTransport = async (args, stage) => checked(
    execute, paths.adb, ['-s', A5_SERIAL, ...args], { env, timeoutMs: 30_000 }, stage
  );
  const sessionOptions = macosAcceptanceSessionOptions({
    libraryHome: path.join(owned.root, 'library'), repoRoot,
    userDataPath: path.join(owned.root, 'user-data')
  });
  const startAndroid = () => startMacosA5SyncGroupApprovalProvider({ execute,
    onProviderStopped: async () => {}, onReady: async () => {}, paths, env });
  const result = await runABConvergenceJourney({
    closeTransport: () => closeMacosAcceptanceTransport(runTransport),
    createAndroidFact: () => createAndroidFact({ env, evidenceRoot, execute, paths, runId }),
    createDesktopFact: (session) => createDesktopSyncGroupJourneyFact({
      device: 'A', evidenceRoot: path.join(evidenceRoot, 'a-fact'), session
    }),
    inspectRestarted: (session, desktopFact, androidFact, received) => inspectRestarted({
      androidFact, desktopFact, paths, received, runId, session
    }),
    openSession: () => openMacosPairSyncDesktopSession(sessionOptions),
    openTransport: () => openMacosAcceptanceTransport(runTransport),
    reportProgress,
    restartAndroid: async () => { await stopAndroid(execute, paths, env); await startAndroid(); },
    startAndroid,
    stopAndroid: () => stopAndroid(execute, paths, env),
    waitForAndroidFact: (factId) => waitForAndroidJourneyFact(paths, factId),
    waitForDesktopFact
  });
  const evidenceRef = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/proofs', `${runId}-a-b.json`);
  fs.mkdirSync(path.dirname(evidenceRef), { recursive: true });
  fs.writeFileSync(evidenceRef, `${JSON.stringify({ completedAt: new Date().toISOString(),
    androidFactId: result.androidFact.factId, desktopFactId: result.desktopFact.factId,
    resultStatus: 'success', runId, ...result.proof
  }, null, 2)}\n`, 'utf8');
  return { evidenceRef, progress: ['a-fact-synced-to-b', 'b-fact-synced-to-a',
    'a-b-restarted', 'a-b-bidirectional-converged'] };
}

async function createAndroidFact({ env, evidenceRoot, execute, paths, runId }) {
  const result = await runMacosA5SyncGroupMaintenance({ action: 'create-journey-fact',
    buildIdentity: runId, env, evidenceRoot: path.join(evidenceRoot, 'b-fact'), execute,
    paths, serial: A5_SERIAL });
  const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));
  const receipt = manifest.receipt;
  const factText = receipt?.factText;
  if (typeof factText !== 'string' || !factText) {
    throw productFailure('android-b', 'deterministic_b_fact_missing', 'Android B fact receipt is incomplete.');
  }
  const factId = receipt?.factId;
  if (typeof factId !== 'string' || !factId) {
    throw productFailure('android-b', 'deterministic_b_fact_missing', 'Android B fact identity is missing.');
  }
  return { factId, factText };
}

async function waitForDesktopFact(session, factId) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const snapshot = await session.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
    if (snapshot?.nodesById?.[factId]) return snapshot;
    await delay(1_000);
  }
  throw productFailure('macos-a', 'deterministic_b_fact_missing',
    'MacOS A did not receive the deterministic B fact.', 'stalled');
}

function desktopObservation(snapshot, mutations) {
  return factObservation(Object.fromEntries(mutations
    .filter(({ factId }) => snapshot?.nodesById?.[factId])
    .map(({ factId, origin }) => [factId, origin])));
}

async function inspectRestarted({ androidFact, desktopFact, paths, received, runId, session }) {
  await session.enable();
  const desktopSnapshot = await session.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
  const android = await androidSnapshot(paths, desktopFact.factId, androidFact.factText);
  const mutations = [
    { factId: desktopFact.factId, origin: 'A', runId },
    { factId: androidFact.factId, origin: 'B', runId }
  ];
  try {
    return assertBidirectionalConvergence({ mutations, observations: {
      received: [desktopObservation(received.desktopReceived, mutations),
        factObservation(received.androidReceived.database?.inspection?.journeyFacts)],
      restarted: [desktopObservation(desktopSnapshot, mutations),
        factObservation(android.database?.inspection?.journeyFacts)]
    } });
  } catch (error) {
    throw Object.assign(error, { failureOwner: 'product', host: 'all',
      missingFact: 'a_b_restart_convergence_missing' });
  }
}

export function expectedJourneyFactPresent(journeyFacts, factId, expectedDevice = 'A') {
  return journeyFacts?.[factId] === expectedDevice;
}

function androidSnapshot(paths, desktopFactId, androidFactText, expectedDevice = 'A') {
  return collectAndroidDeviceSnapshot({ adb: paths.adb, appId: APP_ID, includeEvents: false,
    serial: A5_SERIAL, tables: ['nodes'], databaseInspector: (database) => {
      const workspace = inspectPairSyncRecoveryWorkspace(database);
      const androidFact = androidFactText ? database.prepare(`SELECT id
        FROM nodes WHERE instr(COALESCE(title, '') || '\n' || COALESCE(content, ''), ?) > 0`
      ).get(androidFactText) : null;
      return { ...workspace, androidFactId: androidFact?.id ?? null,
        androidFactPresent: Boolean(androidFact),
        desktopFactPresent: expectedJourneyFactPresent(
          workspace.journeyFacts, desktopFactId, expectedDevice
        ) };
    } });
}

export function readABConvergenceMaterial(repoRoot, runId, required = true) {
  const evidenceRef = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/proofs',
    `${runId}-a-b.json`);
  let evidence;
  try {
    evidence = JSON.parse(fs.readFileSync(evidenceRef, 'utf8'));
  } catch (error) {
    if (!required && error?.code === 'ENOENT') return null;
    throw error;
  }
  if (evidence.resultStatus !== 'success' || typeof evidence.desktopFactId !== 'string'
      || typeof evidence.androidFactId !== 'string') {
    throw new Error('A and B pre-join convergence material is invalid.');
  }
  return { androidFactId: evidence.androidFactId, desktopFactId: evidence.desktopFactId };
}

function stopAndroid(execute, paths, env) {
  return checked(execute, paths.adb, ['-s', A5_SERIAL, 'shell', 'am', 'force-stop', APP_ID],
    { env, timeoutMs: 30_000 }, 'android-stop');
}

async function checked(execute, command, args, options, stage) {
  const result = await execute(command, args, options);
  if (result.code === 0) return result;
  throw Object.assign(new Error(`${stage} failed`), { failureOwner: 'controller', host: 'android-b',
    missingFact: stage, result });
}

function productFailure(host, missingFact, message, status = 'failed') {
  return Object.assign(new Error(message), { failureOwner: 'product', host, missingFact, status });
}
