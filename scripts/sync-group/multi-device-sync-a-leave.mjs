import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { inspectPairSyncRecoveryWorkspace } from '../android/android-pair-sync-recovery-readiness.mjs';
import { collectAndroidDeviceSnapshot } from '../android/android-device-snapshot.mjs';
import { macosA5GradleEnv, macosA5Paths, A5_SERIAL } from '../android/macos-a5-dev.mjs';
import { runMacosA5SyncGroupMaintenance } from '../android/macos-a5-sync-group-maintenance-action.mjs';
import { openMacosPairSyncDesktopSession } from '../android/macos-pair-sync-desktop-session.mjs';
import {
  assertAndroidConsumerComplete, assertSurvivorProof, matchesAndroidSurvivorState,
  projectAndroidConsumerProgress
} from './multi-device-sync-a-leave-proof.mjs';
import { createSyncProgressWatchdog } from './sync-progress-watchdog.mjs';
import { restartARejoinAndroidProvider } from './multi-device-sync-a-rejoin.mjs';
import { macosAcceptanceEnv, macosAcceptanceSessionOptions } from './multi-device-sync-macos-channel.mjs';
import { startWindowsSyncGroupProvider } from './multi-device-sync-windows-provider.mjs';
import { createIsolatedMacosRoot } from './multi-device-sync-workspace.mjs';

/* global AbortController, process */

function memberHosts(database, state) {
  return database.prepare(`SELECT host_name FROM sync_group_members
    WHERE state = ? ORDER BY host_name`).all(state)
    .map(({ host_name }) => host_name);
}

function androidSnapshot(paths) {
  return collectAndroidDeviceSnapshot({ adb: paths.adb, appId: 'com.foliole.android',
    includeEvents: false, serial: A5_SERIAL, tables: ['attachments', 'content_blobs', 'nodes'],
    databaseInspector: (database) => ({ ...inspectPairSyncRecoveryWorkspace(database),
      activeMemberHosts: memberHosts(database, 'active'),
      departedMemberHosts: memberHosts(database, 'left') }) });
}

async function waitUntil(label, inspect, accept, progress, signal, reportActivity = () => {}) {
  const deadline = Date.now() + 12 * 60_000;
  const observe = createSyncProgressWatchdog({ label, stallMs: 60_000 });
  let value;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    value = await inspect();
    signal?.throwIfAborted();
    const detail = progress(value);
    if (observe(JSON.stringify(detail), detail)) reportActivity();
    if (accept(value)) return value;
    await delay(1_000, undefined, signal ? { signal } : undefined);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(value)}`);
}

async function macosFacts(execute, repoRoot, databasePath, factIds) {
  const electron = path.join(repoRoot, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
  const inspector = path.join(repoRoot, 'scripts/windows/windows-sync-group-recovery-inspect.mjs');
  const result = await execute(electron, [inspector, databasePath, ...factIds], {
    cwd: repoRoot, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeoutMs: 30_000
  });
  if (result.code !== 0) throw new Error('macOS A database inspection failed.');
  return JSON.parse(result.stdout.trim());
}

function assertMacosRetention(before, after, factIds) {
  const counts = ['attachmentCount', 'contentBlobCount', 'userNodeCount'];
  if (after.localGroupId !== null || after.localMemberState !== null
      || after.deviceIdentity !== before.deviceIdentity || after.integrity !== 'ok'
      || counts.some((key) => after[key] !== before[key])
      || factIds.some((id) => after.facts?.[id] !== true)) {
    throw new Error('macOS A did not retain its local library after Leave.');
  }
}

function assertActiveThreeMemberInput(overview, baseline) {
  const group = overview.sync_group;
  if (group?.group_id !== baseline.groupId || group.timeline_id !== baseline.timelineId
      || group.local_member_state !== 'active'
      || group.members.filter(({ state }) => state === 'active').length !== 3) {
    throw new Error('macOS A does not have the required three-member input.');
  }
}

async function createAndroidFact({ env, evidenceRoot, execute, paths, runId }) {
  return runMacosA5SyncGroupMaintenance({ action: 'create-journey-fact', buildIdentity: runId,
    env, evidenceRoot: path.join(evidenceRoot, 'b-fact'), execute, paths, serial: A5_SERIAL });
}

function openMacosSession({ env, owned, repoRoot }) {
  return openMacosPairSyncDesktopSession(macosAcceptanceSessionOptions({ env,
    libraryHome: path.join(owned.root, 'library'), repoRoot,
    userDataPath: path.join(owned.root, 'user-data') }));
}

async function leaveAndRestartA(context) {
  const { databasePath, env, execute, owned, paths, rejoin, reportProgress, repoRoot } = context;
  let session = await openMacosSession({ env, owned, repoRoot });
  try {
    await restartARejoinAndroidProvider({ env, execute, paths });
    reportProgress('survivor-provider-ready');
    assertActiveThreeMemberInput(await session.load(), rejoin.proof);
    const before = await macosFacts(execute, repoRoot, databasePath, Object.values(rejoin.factIds));
    const afterLeave = await session.leave();
    if (afterLeave.sync_group !== null || afterLeave.paired_devices.length !== 0) {
      throw new Error('macOS A did not leave through the product action.');
    }
    reportProgress('a-left');
    await session.close();
    session = await openMacosSession({ env, owned, repoRoot });
    const restartedOverview = await session.load();
    if (restartedOverview.sync_group !== null || restartedOverview.paired_devices.length !== 0) {
      throw new Error('macOS A restored obsolete membership after restart.');
    }
    assertMacosRetention(before, await macosFacts(
      execute, repoRoot, databasePath, Object.values(rejoin.factIds)
    ), Object.values(rejoin.factIds));
    reportProgress('a-restarted-unbound');
    return before;
  } finally { await session?.close().catch(() => undefined); }
}

async function runWindowsContinuity(context, before) {
  const { env, evidenceRoot, execute, paths, rejoin, reportActivity,
    reportProgress, repoRoot, runId } = context;
  const expected = { formerHostName: before.localHostName,
    groupId: rejoin.proof.groupId, timelineId: rejoin.proof.timelineId };
  await waitUntil('Android B departure convergence', () => androidSnapshot(paths),
    (value) => matchesAndroidSurvivorState(value, expected),
    (value) => value.database?.inspection);
  reportProgress('b-two-members-active');
  const beforeWindows = await androidSnapshot(paths);
  const windowsProvider = startWindowsSyncGroupProvider({
    action: 'multi-device-sync-a-leave', execute, reportProgress, repoRoot
  });
  let windowsSettled = false;
  try {
    await createAndroidFact({ env, evidenceRoot, execute, paths, runId });
    reportProgress('b-fact-created');
    await restartARejoinAndroidProvider({ env, execute, paths });
    const consumerController = new AbortController();
    const consumer = waitUntil('Android B consumes the new C fact and resources',
      () => androidSnapshot(paths), (value) => {
        try { assertAndroidConsumerComplete({ before: beforeWindows, expected, snapshot: value });
          return true; } catch { return false; }
      }, (value) => projectAndroidConsumerProgress({ before: beforeWindows, expected,
        snapshot: value }),
      consumerController.signal, () => reportActivity('b-consumer-progress'));
    let completed;
    try { completed = await windowsProvider.raceConsumer(consumer); }
    catch (error) {
      consumerController.abort();
      await consumer.catch(() => undefined);
      throw error;
    }
    const ids = assertAndroidConsumerComplete({ before: beforeWindows, expected, snapshot: completed });
    windowsProvider.confirmProgress(ids.C);
    await windowsProvider.release('consumer_complete');
    const remote = await windowsProvider.finish();
    windowsSettled = true;
    if (!['B', 'C'].every((origin) => remote.receipt.factIds?.[origin] === ids[origin])) {
      throw new Error('Windows C reported different survivor fact identities.');
    }
    return remote;
  } finally {
    if (!windowsSettled) await windowsProvider.cancelAndSettle();
  }
}

function matchesFullProof(value, context, before, remote) {
  try {
    assertSurvivorProof({ android: value, baseline: context.rejoin.proof,
      factIds: remote.receipt.factIds, formerHostName: before.localHostName,
      windows: remote.receipt });
    return true;
  } catch { return false; }
}

async function verifyRestartedSurvivors(context, before, remote) {
  const { env, execute, paths, reportProgress } = context;
  await waitUntil('Android B survivor fact convergence', () => androidSnapshot(paths),
    (value) => matchesFullProof(value, context, before, remote),
    (value) => [value.database?.inspection, value.database?.counts]);
  reportProgress('survivor-facts-converged');
  await restartARejoinAndroidProvider({ env, execute, paths });
  const restarted = await waitUntil('Android B restarted survivor state',
    () => androidSnapshot(paths), (value) => matchesFullProof(value, context, before, remote),
    (value) => [value.database?.inspection, value.database?.counts]);
  reportProgress('survivors-restarted');
  const proof = assertSurvivorProof({ android: restarted, baseline: context.rejoin.proof,
    factIds: remote.receipt.factIds, formerHostName: before.localHostName,
    windows: remote.receipt });
  reportProgress('former-a-revoked');
  return proof;
}

function createContext({ execute, reportActivity = () => {}, reportProgress, repoRoot, runId }) {
  const owned = createIsolatedMacosRoot({ repoRoot, runId });
  const evidenceRoot = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs', runId, 'a-leave');
  const rejoin = JSON.parse(fs.readFileSync(path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs',
    runId, 'a-rejoin/a-rejoin-proof.json'), 'utf8'));
  return { databasePath: path.join(owned.root, 'library', 'Data', 'foliole.db'),
    env: macosAcceptanceEnv(macosA5GradleEnv()), evidenceRoot, execute, owned,
    paths: macosA5Paths(repoRoot),
    rejoin, reportActivity, reportProgress, repoRoot, runId };
}

export async function proveALeave(options) {
  const context = createContext(options);
  fs.mkdirSync(context.evidenceRoot, { recursive: true });
  const before = await leaveAndRestartA(context);
  const remote = await runWindowsContinuity(context, before);
  const proof = await verifyRestartedSurvivors(context, before, remote);
  const evidenceRef = path.join(context.evidenceRoot, 'a-leave-proof.json');
  const after = await macosFacts(context.execute, context.repoRoot, context.databasePath,
    Object.values(context.rejoin.factIds));
  fs.writeFileSync(evidenceRef, `${JSON.stringify({ completedAt: new Date().toISOString(),
    factIds: remote.receipt.factIds, macosA: { after, before }, proof, resultStatus: 'success',
    schemaVersion: 1, windowsEvidenceRef: remote.evidenceRef
  }, null, 2)}\n`, 'utf8');
  return { evidenceRef };
}
