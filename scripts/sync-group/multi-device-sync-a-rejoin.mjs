import fs from 'node:fs';
import path from 'node:path';

import { collectAndroidDeviceSnapshot } from '../android/android-device-snapshot.mjs';
import { inspectPairSyncRecoveryWorkspace } from '../android/android-pair-sync-recovery-readiness.mjs';
import { macosA5GradleEnv, macosA5Paths, A5_SERIAL } from '../android/macos-a5-dev.mjs';
import {
  startMacosA5SyncGroupApprovalProvider,
  stopMacosA5SyncGroupApprovalProvider
} from '../android/macos-a5-sync-group-approval.mjs';
import { runMacosA5SyncGroupMaintenance } from '../android/macos-a5-sync-group-maintenance-action.mjs';
import { openMacosPairSyncDesktopSession } from '../android/macos-pair-sync-desktop-session.mjs';
import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import { readABConvergenceMaterial } from './multi-device-sync-ab-convergence.mjs';
import {
  existingJourneyFactIds, freshJourneyFactIds, startWindowsARejoinProvider
} from './multi-device-sync-a-rejoin-provider.mjs';
import {
  macosAcceptanceEnv, macosAcceptanceSessionOptions
} from './multi-device-sync-macos-channel.mjs';
import { readNonemptyAdmissionMaterial } from './multi-device-sync-nonempty-admission-proof.mjs';
import {
  productFailure, waitForThreeDeviceProof, waitUntil
} from './multi-device-sync-three-device-proof.mjs';
import { createIsolatedMacosRoot } from './multi-device-sync-workspace.mjs';

/* global process */

const APP_ID = 'com.foliole.android';

function androidSnapshot(paths) {
  return collectAndroidDeviceSnapshot({ adb: paths.adb, appId: APP_ID, includeEvents: false,
    serial: A5_SERIAL, tables: ['attachments', 'content_blobs', 'nodes'],
    databaseInspector: (database) => ({ ...inspectPairSyncRecoveryWorkspace(database),
      activeMemberHosts: database.prepare(`SELECT host_name FROM sync_group_members
        WHERE state = 'active' ORDER BY host_name`).all().map(({ host_name }) => host_name),
      availableAttachmentIds: database.prepare(`SELECT attachment_id FROM attachment_blobs
        WHERE availability IN ('cached', 'local') ORDER BY attachment_id`).all()
        .map(({ attachment_id }) => attachment_id),
      cachedAttachmentIds: database.prepare(`SELECT attachment_id FROM attachment_blobs
        WHERE availability = 'cached' ORDER BY attachment_id`).all()
        .map(({ attachment_id }) => attachment_id) }) });
}

async function createAndroidFact({ env, evidenceRoot, execute, paths, runId }) {
  const result = await runMacosA5SyncGroupMaintenance({ action: 'create-journey-fact',
    buildIdentity: runId, env, evidenceRoot: path.join(evidenceRoot, 'b-fact'), execute,
    paths, serial: A5_SERIAL });
  const receipt = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8')).receipt;
  if (typeof receipt?.factText !== 'string' || !receipt.factText) {
    throw productFailure('android-b', 'deterministic_b_fact_missing', 'Android B fact receipt is incomplete.');
  }
  return receipt.factText;
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

export async function restartARejoinAndroidProvider({
  env, execute, paths,
  startProvider = startMacosA5SyncGroupApprovalProvider,
  stopProvider = stopMacosA5SyncGroupApprovalProvider
}) {
  await startProvider({
    env, execute,
    onProviderStopped: () => stopProvider({ env, execute, paths }),
    onReady: async () => {}, paths
  });
}

export async function proveARejoin({ execute, reportActivity = () => {}, reportProgress, repoRoot, runId }) {
  const owned = createIsolatedMacosRoot({ repoRoot, runId });
  const paths = macosA5Paths(repoRoot);
  const env = macosAcceptanceEnv(macosA5GradleEnv());
  const evidenceRoot = path.join(repoRoot, '.tmp/artifacts/multi-device-sync/runs', runId, 'a-rejoin');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const abMaterial = readABConvergenceMaterial(repoRoot, runId, false);
  const preJoinMaterial = readNonemptyAdmissionMaterial(repoRoot, runId);
  const windowsProvider = startWindowsARejoinProvider({ evidenceRoot, execute, repoRoot,
    reportProgress: () => reportActivity('windows-provider-progress') });
  let windowsSettled = false;
  const restartProvider = () => restartARejoinAndroidProvider({ env, execute, paths });
  const sessionOptions = macosAcceptanceSessionOptions({
    libraryHome: path.join(owned.root, 'library'), repoRoot,
    userDataPath: path.join(owned.root, 'user-data')
  });
  let session = await openMacosPairSyncDesktopSession(sessionOptions);
  try {
    const enabled = await session.enable();
    if (enabled.server_status?.state !== 'running') throw productFailure('macos-a',
      'a_product_listener_unavailable', 'macOS A sync listener is unavailable.');
    reportProgress('a-listener-ready');
    await restartProvider();
    await waitUntil('macOS A three-member convergence', async () =>
      (await session.load()).sync_group?.members.filter(({ state }) => state === 'active').length ?? 0,
    (value) => value === 3,
      'three_members_missing');
    reportProgress('three-members-converged');
    const databasePath = path.join(owned.root, 'library', 'Data', 'foliole.db');
    const excluded = existingJourneyFactIds(
      (await macosFacts(execute, repoRoot, databasePath, [])).journeyFacts
    );
    const aFact = await createDesktopSyncGroupJourneyFact({ device: 'A', evidenceRoot,
      session, withAttachment: true });
    reportProgress('a-fact-created');
    await createAndroidFact({ env, evidenceRoot, execute, paths, runId });
    reportProgress('b-fact-created');
    await restartProvider();
    await windowsProvider.waitForProgress('c-fact-created');
    const ids = await windowsProvider.raceConsumer(waitUntil('macOS A fresh fact identities', async () =>
      freshJourneyFactIds((await macosFacts(execute, repoRoot, databasePath, [])).journeyFacts, excluded),
    (value) => ['A', 'B', 'C'].every((origin) => value[origin]),
    'three_facts_missing'));
    reportProgress('c-fact-created');
    if (ids.A !== aFact.factId || !ids.B || !ids.C) throw productFailure('windows-c',
      'windows_a_rejoin_fact_identity_mismatch', 'Windows C reported incomplete fresh facts.');
    await waitUntil('macOS A fresh fact convergence', async () => {
      const snapshot = await session.invoke('load_workspace_list_snapshot', { includePdfOpenings: false });
      return Object.keys(snapshot.nodesById ?? {}).filter((id) => !excluded.has(id));
    }, (value) => Object.values(ids).every((id) => value.includes(id)),
    'three_facts_missing');
    await waitUntil('Android B fresh fact and resource convergence', () => androidSnapshot(paths),
      (value) => Object.values(ids).every((id) => value.database?.inspection?.journeyFacts?.[id])
        && value.database.inspection.missingAttachmentCount === 0
        && value.database.inspection.missingContentBlobCount === 0
        && value.database.counts.attachments >= 1,
      'android_three_facts_missing', (value) => [
        value.database?.inspection?.activeSyncGroupMemberCount,
        value.database?.inspection?.journeyFacts,
        value.database?.inspection?.missingAttachmentCount,
        value.database?.inspection?.missingContentBlobCount,
        value.database?.counts?.attachments
      ]);
    await windowsProvider.release('consumer_complete');
    const remote = await windowsProvider.finish();
    windowsSettled = true;
    if (!['A', 'B', 'C'].every((origin) => remote.receipt.factIds?.[origin] === ids[origin])) throw productFailure('windows-c',
      'windows_a_rejoin_fact_identity_mismatch', 'Windows C reported different fresh facts.');
    reportProgress('three-facts-converged');
    await session.close(); session = null;
    await restartProvider();
    session = await openMacosPairSyncDesktopSession(sessionOptions);
    const requiredIds = { ...ids, ...(abMaterial ? {
      preJoinA: abMaterial.desktopFactId, preJoinB: abMaterial.androidFactId
    } : {}), preJoinC: preJoinMaterial.factId };
    const proof = await waitForThreeDeviceProof({ ids: requiredIds, inspect: async () => ({
      android: await androidSnapshot(paths),
      macos: await macosFacts(execute, repoRoot, databasePath, Object.values(requiredIds)),
      windows: remote.receipt.restarted
    }), requiredAttachmentId: preJoinMaterial.attachmentId, runId });
    reportProgress('three-members-restarted');
    const evidenceRef = path.join(evidenceRoot, 'a-rejoin-proof.json');
    fs.writeFileSync(evidenceRef, `${JSON.stringify({ completedAt: new Date().toISOString(),
      abMaterial, factIds: ids, groupContext: {
        groupId: remote.receipt.restarted.localGroupId,
        timelineId: remote.receipt.restarted.localTimelineId
      }, preJoinMaterial, proof, resultStatus: 'success', schemaVersion: 1
    }, null, 2)}\n`, 'utf8');
    return { evidenceRef };
  } finally {
    await session?.close().catch(() => undefined);
    if (!windowsSettled) await windowsProvider.cancelAndSettle();
  }
}
