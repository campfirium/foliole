import fs from 'node:fs';
import path from 'node:path';

import { writeT152TwoDeviceCellReceipt } from '../acceptance/t152-two-device-cell-receipt.mjs';
import {
  buildT152TwoDeviceProof, writeT152ResourceLocator
} from '../acceptance/t152-two-device-proof-builder.mjs';
import {
  openMacosSyncGroupDesktopSession, waitForMacosAutomaticRun
} from '../android/macos-sync-group-desktop-session.mjs';
import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import { forkDesktopSyncConflict } from '../desktop/sync-group-conflict-action.mjs';
import { createActionExecutor } from '../sync-group/multi-device-sync-action-executor.mjs';
import { macosAcceptanceEnv } from '../sync-group/multi-device-sync-macos-channel.mjs';
import { startWindowsSyncGroupProvider } from '../sync-group/multi-device-sync-windows-provider.mjs';

/* global process */

async function waitForFacts(session, counts, timeoutMs = 5 * 60_000) {
  return session.waitForState({ command: 'load_workspace_list_snapshot',
    commandArgs: { includePdfOpenings: false }, condition: {
      counts: Object.fromEntries(Object.entries(counts).map(([origin, count]) =>
        [`Multi-device sync ${origin} fact`, count])), kind: 'fact-prefix-counts'
    }, eventName: 'onWorkspaceSyncApplied', timeoutMs });
}

async function discoverWindows(session, identity, timeoutMs = 2 * 60_000) {
  const overview = await session.waitForState({ command: 'load_sync_group_overview',
    condition: { ...identity, kind: 'candidate-identity' }, eventName: 'onSyncGroupDiscoveryChanged',
    timeoutMs, triggerCommand: 'discover_sync_groups' });
  const matches = overview.join_candidates.filter((candidate) =>
    candidate.group_id === identity.groupId && candidate.group_tag === identity.groupTag);
  if (matches.length !== 1) throw new Error('Windows Sync Group discovery was not unique.');
  return matches[0];
}

async function completeJoin(session, groupId) {
  const overview = await session.invoke('complete_sync_group_join');
  if (overview.sync_group?.group_id !== groupId) {
    throw new Error('Mac joined a different Sync Group.');
  }
  return overview;
}

function openSession(repoRoot, sharedRoot) {
  return openMacosSyncGroupDesktopSession({ env: macosAcceptanceEnv(),
    libraryHome: path.join(sharedRoot, 'macos-library'), repoRoot,
    runtimeRoot: path.join(sharedRoot, 'macos-runtime') });
}

async function conflictSeed(session) {
  const snapshot = await session.invoke('load_workspace_list_snapshot', {
    includePdfOpenings: false
  });
  const matches = Object.values(snapshot.nodesById ?? {}).filter(({ title }) =>
    String(title).startsWith('T152 conflict t152-conflict-'));
  if (matches.length !== 1) throw new Error('Mac did not receive one exact conflict seed.');
  return matches[0].id ?? matches[0].nodeId;
}

export async function runMacosJoinsWindowsSyncGroup({ acceptedTip, evidenceRoot, repoRoot,
  sharedRoot }) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const execute = createActionExecutor({ logPath: path.join(evidenceRoot, 'windows-action.log'),
    progressPath: path.join(evidenceRoot, 'windows-progress.jsonl') });
  const provider = startWindowsSyncGroupProvider({ action: 'two-device-sync-provider',
    execute, repoRoot });
  const macosLibrary = path.join(sharedRoot, 'macos-library');
  if (process.env.FOLIOLE_T152_CELL_ID && fs.existsSync(macosLibrary)) {
    throw new Error('The T152 Mac task library locator was already used.');
  }
  let providerSettled = false;
  let session;
  try {
    await provider.waitForProgress('provider-ready');
    const providerIdentity = await provider.waitForGroupIdentity();
    session = await openSession(repoRoot, sharedRoot);
    const initialFact = await createDesktopSyncGroupJourneyFact({ device: 'B',
      evidenceRoot: path.join(evidenceRoot, 'macos-initial-fact'), session });
    await session.invoke('enable_companion_sync');
    const candidate = await discoverWindows(session, providerIdentity);
    await session.invoke('request_sync_group_join', { endpoint_url: candidate.endpoint_url });
    const pending = (await session.load()).join_request;
    if (!pending || JSON.stringify(pending).includes('workgroup_key')) {
      throw new Error('Mac pending join state did not remain key-free.');
    }
    await provider.waitForProgress('accepted');
    const joined = await completeJoin(session, candidate.group_id);
    const initialRun = await session.loadSyncTriggerResult();
    if (initialRun?.reason !== 'initial' || initialRun?.status !== 'completed') {
      throw new Error(`Mac initial sync did not complete: ${JSON.stringify(initialRun)}`);
    }
    await waitForFacts(session, { A: 1, B: 1 });
    const automaticFact = await createDesktopSyncGroupJourneyFact({ device: 'B',
      evidenceRoot: path.join(evidenceRoot, 'macos-automatic-fact'), session });
    await provider.waitForProgress('automatic-converged');
    await waitForFacts(session, { A: 2, B: 2 });
    const automaticBeforeRestart = await waitForMacosAutomaticRun(session, initialRun.run_id);
    await provider.waitForProgress('conflict-fork-ready');
    const conflictNodeId = await conflictSeed(session);
    await session.invoke('pause_companion_sync');
    await forkDesktopSyncConflict({ label: 'macos', nodeId: conflictNodeId, session });
    await session.invoke('resume_companion_sync');
    await provider.release('consumer_complete');
    const manualBeforeRestart = await session.invoke('sync_companion_now');
    const conflicts = await session.waitForState({ command: 'load_sync_node_conflicts',
      commandArgs: { objectIds: [conflictNodeId] },
      condition: { count: 1, kind: 'sync-conflict-count' },
      eventName: 'onWorkspaceSyncApplied', timeoutMs: 2 * 60_000 });
    const conflict = { conflictCount: conflicts.length, nodeId: conflictNodeId,
      silentOverwrite: false, visible: true };
    await session.close(); session = await openSession(repoRoot, sharedRoot);
    const restarted = await session.load();
    if (restarted.sync_group?.group_id !== candidate.group_id) {
      throw new Error('Mac did not restore the Windows-created Sync Group.');
    }
    const automaticAfterRestart = await waitForMacosAutomaticRun(
      session, manualBeforeRestart?.run_id
    );
    const manualAfterRestart = await session.invoke('sync_companion_now');
    await waitForFacts(session, { A: 2, B: 2 });
    const windows = await provider.finish(); providerSettled = true;
    const windowsReceipt = windows.receipt;
    const receipt = { acceptedTip, automaticFactId: automaticFact.factId,
      completedAt: new Date().toISOString(), deviceCount: joined.sync_group.devices.length,
      groupId: candidate.group_id, groupTag: candidate.group_tag,
      initialFactId: initialFact.factId,
      deviceIdentities: { macos: joined.sync_group.local_device_identity_key,
        windows: windowsReceipt.localDeviceIdentityKey },
      preAcceptGroupKeyPresent: false,
      conflict,
      runs: { macos: { automaticAfterRestart, automaticBeforeRestart, initial: initialRun,
        manualAfterRestart, manualBeforeRestart }, windows: windowsReceipt.runs },
      resultStatus: 'success', schemaVersion: 1, sharedRoot,
      windowsEvidenceRoot: path.dirname(windows.evidenceRef) };
    const receiptPath = path.join(evidenceRoot, 'receipt.json');
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    if (process.env.FOLIOLE_T152_CELL_ID) {
      await session.close();
      const windowsLocator = writeT152ResourceLocator(evidenceRoot, 'windows', {
        identity: windowsReceipt.localDeviceIdentityKey,
        library: windowsReceipt.libraryLocator, receipt: windows.evidenceRef
      });
      const macosLocator = writeT152ResourceLocator(evidenceRoot, 'macos', {
        identity: receipt.deviceIdentities.macos, library: macosLibrary
      });
      writeT152TwoDeviceCellReceipt(buildT152TwoDeviceProof({
        automaticBeforeRestartHost: 'macos',
        builds: { macos: acceptedTip, windows: windowsReceipt.buildIdentity },
        business: { idempotent: true, twoWayUnion: true }, conflict,
        devices: { macos: { identity: receipt.deviceIdentities.macos },
          windows: { identity: receipt.deviceIdentities.windows } },
        failureLocator: evidenceRoot, groupId: receipt.groupId, groupTag: receipt.groupTag,
        libraries: [{ locator: macosLocator }, { locator: windowsLocator }],
        rawRuns: receipt.runs
      }));
    }
    return { receipt, receiptPath };
  } finally {
    await session?.close().catch(() => undefined);
    if (!providerSettled) await provider.cancelAndSettle();
  }
}
