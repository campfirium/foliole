#!/usr/bin/env node
/* global console, process */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { writeT152TwoDeviceCellReceipt } from '../acceptance/t152-two-device-cell-receipt.mjs';
import {
  buildT152TwoDeviceProof, writeT152ResourceLocator
} from '../acceptance/t152-two-device-proof-builder.mjs';
import {
  openMacosSyncGroupDesktopSession, waitForMacosAutomaticRun, waitForMacosDeviceRequest
} from '../android/macos-sync-group-desktop-session.mjs';
import { macosAcceptanceEnv } from '../sync-group/multi-device-sync-macos-channel.mjs';
import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import {
  createDesktopSyncConflictSeed, forkDesktopSyncConflict
} from '../desktop/sync-group-conflict-action.mjs';
import { createActionExecutor } from '../sync-group/multi-device-sync-action-executor.mjs';
import { startWindowsSyncGroupProvider } from '../sync-group/multi-device-sync-windows-provider.mjs';
import { runMacosJoinsWindowsSyncGroup } from './macos-joins-windows-sync-group.mjs';

const execute = promisify(execFile);

async function acceptedRevision(repoRoot) {
  const { stdout } = await execute('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
  return stdout.trim();
}

async function waitForOriginCount(session, origin, count, timeoutMs = 2 * 60_000) {
  return session.waitForState({ command: 'load_workspace_list_snapshot',
    commandArgs: { includePdfOpenings: false },
    condition: { counts: { [`Multi-device sync ${origin} fact`]: count },
      kind: 'fact-prefix-counts' }, eventName: 'onWorkspaceSyncApplied', timeoutMs });
}

export async function runMacosWindowsSinglePrincipalSyncGroup({
  creator = 'macos', repoRoot = process.cwd()
} = {}) {
  const acceptedTip = await acceptedRevision(repoRoot);
  const evidenceRoot = path.join(repoRoot, '.tmp/artifacts/t152-7-windows', acceptedTip,
    creator === 'windows' ? 'windows-creates' : 'macos-creates');
  const sharedRoot = process.env.FOLIOLE_T152_ACCEPTANCE_ROOT?.trim() || evidenceRoot;
  if (creator === 'windows') {
    return runMacosJoinsWindowsSyncGroup({ acceptedTip, evidenceRoot, repoRoot, sharedRoot });
  }
  if (creator !== 'macos') throw new Error('Desktop creator must be macos or windows.');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const macosLibrary = path.join(sharedRoot, 'macos-library');
  if (process.env.FOLIOLE_T152_CELL_ID && fs.existsSync(macosLibrary)) {
    throw new Error('The T152 Mac task library locator was already used.');
  }
  let session = await openMacosSyncGroupDesktopSession({ env: macosAcceptanceEnv(),
    libraryHome: macosLibrary, repoRoot,
    runtimeRoot: path.join(sharedRoot, 'macos-runtime') });
  let windowsProvider;
  let windowsSettled = false;
  try {
    const macosFact = await createDesktopSyncGroupJourneyFact({ device: 'A',
      evidenceRoot: path.join(evidenceRoot, 'macos-fact'), session });
    const conflictSeed = await createDesktopSyncConflictSeed({
      evidenceRoot: path.join(evidenceRoot, 'conflict-seed'), session
    });
    const initial = await session.enable();
    const macosRunBeforeJoin = await session.loadSyncTriggerResult();
    const runWindowsAction = createActionExecutor({
      logPath: path.join(evidenceRoot, 'windows-action.log'),
      progressPath: path.join(evidenceRoot, 'windows-progress.jsonl')
    });
    windowsProvider = startWindowsSyncGroupProvider({
      action: 'single-principal-sync-group', execute: runWindowsAction,
      expectedGroupId: initial.sync_group.group_id,
      expectedGroupTag: initial.sync_group.group_tag, repoRoot
    });
    await windowsProvider.waitForProgress('requested');
    const request = await waitForMacosDeviceRequest(session, null, { timeoutMs: 15 * 60_000 });
    if (JSON.stringify(request).includes('workgroup_key')) {
      throw new Error('Mac pending Device request exposed the Sync Group key.');
    }
    const accepted = await session.accept(request.request_id);
    await waitForOriginCount(session, 'C', 2);
    const macosAutomaticBeforeRestart = await waitForMacosAutomaticRun(
      session, macosRunBeforeJoin?.run_id
    );
    const macosAutomaticFact = await createDesktopSyncGroupJourneyFact({ device: 'A',
      evidenceRoot: path.join(evidenceRoot, 'macos-automatic-fact'), session });
    await windowsProvider.waitForProgress('conflict-fork-ready');
    await session.invoke('pause_companion_sync');
    await forkDesktopSyncConflict({ label: 'macos', nodeId: conflictSeed.nodeId, session });
    await session.invoke('resume_companion_sync');
    await windowsProvider.release('consumer_complete');
    const macosManualBeforeRestart = await session.invoke('sync_companion_now');
    const conflicts = await session.waitForState({ command: 'load_sync_node_conflicts',
      commandArgs: { objectIds: [conflictSeed.nodeId] },
      condition: { count: 1, kind: 'sync-conflict-count' },
      eventName: 'onWorkspaceSyncApplied', timeoutMs: 2 * 60_000 });
    const conflict = { conflictCount: conflicts.length, nodeId: conflictSeed.nodeId,
      silentOverwrite: false, visible: true };
    await windowsProvider.waitForProgress('restarted');
    const automaticSnapshot = await session.invoke('load_workspace_list_snapshot', {
      includePdfOpenings: false
    });
    const factIds = Object.values(automaticSnapshot.nodesById).filter(({ title }) =>
      /^Multi-device sync [AC] fact/u.test(String(title))).map(({ id }) => id).sort();
    await session.close();
    session = await openMacosSyncGroupDesktopSession({ env: macosAcceptanceEnv(),
      libraryHome: path.join(sharedRoot, 'macos-library'), repoRoot,
      runtimeRoot: path.join(sharedRoot, 'macos-runtime') });
    const restarted = await session.load();
    if (restarted.sync_group?.group_id !== initial.sync_group.group_id) {
      throw new Error('Mac did not restore its two-Device Sync Group.');
    }
    const macosAutomaticAfterRestart = await waitForMacosAutomaticRun(
      session, macosManualBeforeRestart?.run_id
    );
    const macosManualAfterRestart = await session.invoke('sync_companion_now');
    const repeated = await session.invoke('load_workspace_list_snapshot', {
      includePdfOpenings: false
    });
    const repeatedIds = Object.values(repeated.nodesById).filter(({ title }) =>
      /^Multi-device sync [AC] fact/u.test(String(title))).map(({ id }) => id).sort();
    if (JSON.stringify(repeatedIds) !== JSON.stringify(factIds)) {
      throw new Error('Repeated Mac sync was not idempotent.');
    }
    const windows = await windowsProvider.finish(); windowsSettled = true;
    const windowsReceipt = windows.receipt;
    const windowsEvidenceRoot = path.dirname(windows.evidenceRef);
    if (windowsReceipt.resultStatus !== 'success' || windowsReceipt.localDevicePersisted !== true
        || !automaticSnapshot?.nodesById?.[windowsReceipt.automaticFactId]) {
      throw new Error('Windows did not persist and automatically sync its accepted Device.');
    }
    const receipt = { acceptedTip, completedAt: new Date().toISOString(),
      deviceCount: accepted.sync_group?.devices?.length ?? 0,
      groupId: accepted.sync_group?.group_id ?? null,
      groupTag: accepted.sync_group?.group_tag ?? null,
      macosProviderPort: initial.server_status.port, requestId: request.request_id,
      journeyFacts: { macos: macosFact.factId, windows: windowsReceipt.journeyFactId,
        macosAutomatic: macosAutomaticFact.factId,
        windowsAutomatic: windowsReceipt.automaticFactId },
      idempotent: true, macosRestarted: true,
      runs: { macos: { automaticAfterRestart: macosAutomaticAfterRestart,
        automaticBeforeRestart: macosAutomaticBeforeRestart,
        manualAfterRestart: macosManualAfterRestart,
        manualBeforeRestart: macosManualBeforeRestart }, windows: windowsReceipt.runs },
      deviceIdentities: { macos: accepted.sync_group?.local_device_identity_key,
        windows: windowsReceipt.localDeviceIdentityKey },
      preAcceptGroupKeyPresent: false,
      conflict,
      resultStatus: 'success', schemaVersion: 4, sharedRoot,
      windowsEvidenceRoot };
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
    console.log(`[macos-windows-single-principal] status=success receipt=${receiptPath}`);
    return { receipt, receiptPath };
  } finally {
    await session.close().catch(() => undefined);
    if (windowsProvider && !windowsSettled) await windowsProvider.cancelAndSettle();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const creatorIndex = process.argv.indexOf('--creator');
  const creator = creatorIndex >= 0 ? process.argv[creatorIndex + 1] : 'macos';
  runMacosWindowsSinglePrincipalSyncGroup({ creator }).catch((error) => {
    console.error(`[macos-windows-single-principal] status=failed message=${error.message}`);
    process.exitCode = 1;
  });
}
