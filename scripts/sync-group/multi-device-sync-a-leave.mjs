import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import {
  identityFingerprint, inspectPairSyncRecoveryWorkspace
} from '../android/android-pair-sync-recovery-readiness.mjs';
import { collectAndroidDeviceSnapshot } from '../android/android-device-snapshot.mjs';
import { macosA5GradleEnv, macosA5Paths, A5_SERIAL } from '../android/macos-a5-dev.mjs';
import { runMacosA5SyncGroupMaintenance } from '../android/macos-a5-sync-group-maintenance-action.mjs';
import { openMacosPairSyncDesktopSession } from '../android/macos-pair-sync-desktop-session.mjs';
import {
  assertSurvivorProof, matchesAndroidSurvivorState
} from './multi-device-sync-a-leave-proof.mjs';
import { createSyncProgressWatchdog } from './sync-progress-watchdog.mjs';
import { restartARejoinAndroidProvider } from './multi-device-sync-a-rejoin.mjs';
import { createIsolatedMacosRoot } from './multi-device-sync-workspace.mjs';

/* global process */

function memberIdentities(database, state) {
  return database.prepare(`SELECT device_id FROM sync_group_members
    WHERE state = ? ORDER BY device_id`).all(state)
    .map(({ device_id }) => identityFingerprint(device_id));
}

function androidSnapshot(paths) {
  return collectAndroidDeviceSnapshot({ adb: paths.adb, appId: 'com.foliole.android',
    includeEvents: false, serial: A5_SERIAL, tables: ['attachments', 'content_blobs', 'nodes'],
    databaseInspector: (database) => ({ ...inspectPairSyncRecoveryWorkspace(database),
      activeMemberIdentities: memberIdentities(database, 'active'),
      departedMemberIdentities: memberIdentities(database, 'left') }) });
}

async function waitUntil(label, inspect, accept, progress) {
  const deadline = Date.now() + 12 * 60_000;
  const observe = createSyncProgressWatchdog({ label, stallMs: 60_000 });
  let value;
  while (Date.now() < deadline) {
    value = await inspect();
    observe(JSON.stringify(progress(value)), value);
    if (accept(value)) return value;
    await delay(1_000);
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

function readWindowsReceipt(result, repoRoot) {
  const match = /^\[windows-dev-action\] multi-device-sync-a-leave identity=([A-Za-z0-9.-]{1,96})/mu
    .exec(result.output);
  if (!match) throw new Error('Windows C A-leave action did not report fixed evidence.');
  const evidenceRef = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/windows-c', match[1],
    'multi-device-sync-a-leave-receipt.json');
  if (!fs.existsSync(evidenceRef)) throw new Error('Windows C A-leave receipt is missing.');
  return { evidenceRef, receipt: JSON.parse(fs.readFileSync(evidenceRef, 'utf8')) };
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

function openMacosSession({ owned, repoRoot }) {
  return openMacosPairSyncDesktopSession({ libraryHome: path.join(owned.root, 'library'),
    repoRoot, userDataPath: path.join(owned.root, 'user-data') });
}

async function leaveAndRestartA(context) {
  const { databasePath, env, execute, owned, paths, rejoin, reportProgress, repoRoot } = context;
  let session = await openMacosSession({ owned, repoRoot });
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
    session = await openMacosSession({ owned, repoRoot });
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
  const { env, evidenceRoot, execute, paths, rejoin, reportProgress, repoRoot, runId } = context;
  const expected = { formerDeviceIdentity: before.deviceIdentity,
    groupId: rejoin.proof.groupId, timelineId: rejoin.proof.timelineId };
  await waitUntil('Android B departure convergence', () => androidSnapshot(paths),
    (value) => matchesAndroidSurvivorState(value, expected),
    (value) => value.database?.inspection);
  reportProgress('b-two-members-active');
  await createAndroidFact({ env, evidenceRoot, execute, paths, runId });
  reportProgress('b-fact-created');
  await restartARejoinAndroidProvider({ env, execute, paths });
  const beforeWindows = await androidSnapshot(paths);
  const knownCFacts = new Set(Object.entries(beforeWindows.database?.inspection?.journeyFacts ?? {})
    .filter(([, origin]) => origin === 'C').map(([id]) => id));
  const windowsWork = execute(process.execPath,
    ['scripts/windows/windows-dev-control.mjs', 'multi-device-sync-a-leave'], {
    action: 'windows-c-a-leave', cwd: repoRoot, host: 'windows-c', timeoutMs: 15 * 60_000
  });
  const cObserved = waitUntil('Android B receives the new C fact', () => androidSnapshot(paths),
    (value) => Object.entries(value.database?.inspection?.journeyFacts ?? {})
      .some(([id, origin]) => origin === 'C' && !knownCFacts.has(id)),
    (value) => value.database?.inspection?.journeyFacts).then((value) => {
    reportProgress('c-fact-created'); return value;
  });
  const [windowsResult] = await Promise.all([windowsWork, cObserved]);
  if (windowsResult.code !== 0) throw new Error('Windows C A-leave action failed.');
  return readWindowsReceipt(windowsResult, repoRoot);
}

function matchesFullProof(value, context, before, remote) {
  try {
    assertSurvivorProof({ android: value, baseline: context.rejoin.proof,
      factIds: remote.receipt.factIds, formerDeviceIdentity: before.deviceIdentity,
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
    factIds: remote.receipt.factIds, formerDeviceIdentity: before.deviceIdentity,
    windows: remote.receipt });
  reportProgress('former-a-revoked');
  return proof;
}

function createContext({ execute, reportProgress, repoRoot, runId }) {
  const owned = createIsolatedMacosRoot({ repoRoot, runId });
  const evidenceRoot = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs', runId, 'a-leave');
  const rejoin = JSON.parse(fs.readFileSync(path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs',
    runId, 'a-rejoin/a-rejoin-proof.json'), 'utf8'));
  return { databasePath: path.join(owned.root, 'library', 'Data', 'foliole.db'),
    env: macosA5GradleEnv(), evidenceRoot, execute, owned, paths: macosA5Paths(repoRoot),
    rejoin, reportProgress, repoRoot, runId };
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
