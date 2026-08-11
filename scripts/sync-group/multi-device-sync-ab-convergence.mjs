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
  closePairSyncRecoveryTransport, openPairSyncRecoveryTransport
} from '../windows/windows-a5-pair-sync-recovery-transport.mjs';
import { createIsolatedMacosRoot } from './multi-device-sync-workspace.mjs';

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
    await actions.waitForAndroidFact(desktopFact.factId);
    actions.reportProgress?.('a-fact-synced-to-b');
    await actions.closeTransport();
    transportOpen = false;
    const androidFact = await actions.createAndroidFact();
    await actions.waitForDesktopFact(session, androidFact.factText);
    actions.reportProgress?.('b-fact-synced-to-a');
    await session.close();
    session = null;
    await actions.restartAndroid();
    actions.reportProgress?.('a-b-restarted');
    session = await actions.openSession();
    const proof = await actions.inspectRestarted(session, desktopFact.factId, androidFact.factText);
    actions.reportProgress?.('a-b-bidirectional-converged');
    return { androidFact, desktopFact, proof };
  } finally {
    if (transportOpen) await actions.closeTransport().catch(() => undefined);
    await session?.close().catch(() => undefined);
  }
}

export async function waitForAndroidJourneyFact(paths, factId, wait = delay) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const snapshot = await androidSnapshot(paths, factId, null);
    if (snapshot.database?.inspection?.desktopFactPresent) return snapshot;
    await wait(1_000);
  }
  throw productFailure('android-b', 'deterministic_a_fact_missing',
    'Android B did not receive the deterministic A fact.', 'stalled');
}

export async function proveABConvergence({ execute, reportProgress, repoRoot, runId }) {
  const owned = createIsolatedMacosRoot({ repoRoot, runId });
  const paths = macosA5Paths(repoRoot);
  const env = macosA5GradleEnv();
  const evidenceRoot = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs', runId,
    'a-b-convergence');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const runTransport = async (args, stage) => checked(
    execute, paths.adb, ['-s', A5_SERIAL, ...args], { env, timeoutMs: 30_000 }, stage
  );
  const sessionOptions = { libraryHome: path.join(owned.root, 'library'), repoRoot,
    userDataPath: path.join(owned.root, 'user-data') };
  const startAndroid = () => startMacosA5SyncGroupApprovalProvider({ execute,
    onProviderStopped: async () => {}, onReady: async () => {}, paths, env });
  const result = await runABConvergenceJourney({
    closeTransport: () => closePairSyncRecoveryTransport(runTransport),
    createAndroidFact: () => createAndroidFact({ env, evidenceRoot, execute, paths, runId }),
    createDesktopFact: (session) => createDesktopSyncGroupJourneyFact({
      device: 'A', evidenceRoot: path.join(evidenceRoot, 'a-fact'), session
    }),
    inspectRestarted: (session, desktopFactId, androidFactText) => inspectRestarted({
      androidFactText, desktopFactId, paths, session
    }),
    openSession: () => openMacosPairSyncDesktopSession(sessionOptions),
    openTransport: () => openPairSyncRecoveryTransport(runTransport),
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
    desktopFactId: result.desktopFact.factId, resultStatus: 'success', runId, ...result.proof
  }, null, 2)}\n`, 'utf8');
  return { evidenceRef, progress: ['a-fact-synced-to-b', 'b-fact-synced-to-a',
    'a-b-restarted', 'a-b-bidirectional-converged'] };
}

async function createAndroidFact({ env, evidenceRoot, execute, paths, runId }) {
  const result = await runMacosA5SyncGroupMaintenance({ action: 'create-journey-fact',
    buildIdentity: runId, env, evidenceRoot: path.join(evidenceRoot, 'b-fact'), execute,
    paths, serial: A5_SERIAL });
  const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));
  const factText = manifest.receipt?.factText;
  if (typeof factText !== 'string' || !factText) {
    throw productFailure('android-b', 'deterministic_b_fact_missing', 'Android B fact receipt is incomplete.');
  }
  return { factText };
}

async function waitForDesktopFact(session, factText) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const snapshot = await session.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
    if (Object.values(snapshot?.nodesById ?? {}).some((node) =>
      `${node?.title ?? ''}\n${node?.content ?? ''}`.includes(factText))) return snapshot;
    await delay(1_000);
  }
  throw productFailure('macos-a', 'deterministic_b_fact_missing',
    'MacOS A did not receive the deterministic B fact.', 'stalled');
}

async function inspectRestarted({ androidFactText, desktopFactId, paths, session }) {
  const overview = await session.enable();
  const desktopSnapshot = await session.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
  const android = await androidSnapshot(paths, desktopFactId, androidFactText);
  const activeDesktopMembers = overview.sync_group?.members?.filter((item) => item.state === 'active').length;
  const inspection = android.database?.inspection;
  const desktopHasBoth = Boolean(desktopSnapshot?.nodesById?.[desktopFactId])
    && JSON.stringify(desktopSnapshot).includes(androidFactText);
  if (!overview.sync_group?.group_id || activeDesktopMembers !== 2 || !desktopHasBoth
      || android.database?.integrity !== 'ok' || inspection?.activeSyncGroupMemberCount !== 2
      || inspection.syncGroupId !== overview.sync_group.group_id
      || inspection.syncGroupTimelineId !== overview.sync_group.timeline_id
      || !inspection.desktopFactPresent || !inspection.androidFactPresent) {
    throw productFailure('all', 'a_b_restart_convergence_missing',
      'A and B did not preserve the restarted bidirectional convergence facts.');
  }
  return { activeMemberCount: 2, androidFactPresent: true, desktopFactPresent: true,
    groupId: overview.sync_group.group_id, restarted: true, timelineId: overview.sync_group.timeline_id };
}

function androidSnapshot(paths, desktopFactId, androidFactText) {
  return collectAndroidDeviceSnapshot({ adb: paths.adb, appId: APP_ID, includeEvents: false,
    serial: A5_SERIAL, tables: ['nodes'], databaseInspector: (database) => {
      const workspace = inspectPairSyncRecoveryWorkspace(database);
      const androidFactPresent = androidFactText ? Number(database.prepare(`SELECT COUNT(*) AS value
        FROM nodes WHERE instr(COALESCE(title, '') || '\n' || COALESCE(content, ''), ?) > 0`
      ).get(androidFactText)?.value ?? 0) > 0 : false;
      return { ...workspace, androidFactPresent,
        desktopFactPresent: workspace.journeyFacts?.[desktopFactId] === 'A' };
    } });
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
