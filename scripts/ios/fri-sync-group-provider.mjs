#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  openMacosSyncGroupDesktopSession,
  waitForMacosAutomaticRun, waitForMacosDeviceRequest
} from '../android/macos-sync-group-desktop-session.mjs';
import {
  assertMacosAcceptanceSyncGroupServer, macosAcceptanceEnv
} from '../sync-group/multi-device-sync-macos-channel.mjs';
import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import {
  createDesktopSyncConflictSeed, forkDesktopSyncConflict, loadVisibleDesktopSyncConflict
} from '../desktop/sync-group-conflict-action.mjs';

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function waitForStop() {
  return new Promise((resolve) => {
    process.once('SIGINT', () => resolve('SIGINT'));
    process.once('SIGTERM', () => resolve('SIGTERM'));
  });
}

async function waitForDeviceCount(session, count, timeoutMs = 120_000) {
  const loaded = await session.load();
  if (loaded.sync_group?.devices?.length >= count) return loaded;
  return session.waitForState({ command: 'load_sync_group_overview',
    condition: { deviceCount: count, groupId: loaded.sync_group?.group_id, kind: 'group' },
    eventName: 'onSyncGroupJoinRequestsChanged', timeoutMs });
}

function journeyOrigins(snapshot) {
  return [...new Set(Object.values(snapshot?.nodesById ?? {}).flatMap(({ title }) => {
    const match = String(title).match(/^Multi-device sync ([ABCD]) fact/u);
    return match ? [match[1]] : [];
  }))].sort();
}

async function waitForJourneyOrigin(session, origin, count = 1, timeoutMs = 5 * 60_000) {
  const snapshot = await session.waitForState({ command: 'load_workspace_list_snapshot',
    commandArgs: { includePdfOpenings: false }, condition: {
      counts: { [`Multi-device sync ${origin} fact`]: count }, kind: 'fact-prefix-counts'
    }, eventName: 'onWorkspaceSyncApplied', timeoutMs });
  return journeyOrigins(snapshot);
}

export async function runFriSyncGroupProvider({ acceptanceRoot = evidenceRoot,
  evidenceRoot, repoRoot = process.cwd(), twoDevice = false,
  onState = () => {}, waitForRelease = waitForStop }) {
  const openSession = () => openMacosSyncGroupDesktopSession({
    env: macosAcceptanceEnv(), libraryHome: path.join(acceptanceRoot, 'macos-library'), repoRoot,
    runtimeRoot: path.join(acceptanceRoot, 'macos-runtime')
  });
  let session = await openSession();
  const receiptPath = path.join(evidenceRoot, 'provider-receipt.json');
  try {
    const initialFact = twoDevice ? await createDesktopSyncGroupJourneyFact({ device: 'A',
      evidenceRoot: path.join(evidenceRoot, 'macos-initial-fact'), session }) : null;
    const conflictSeed = twoDevice ? await createDesktopSyncConflictSeed({
      evidenceRoot: path.join(evidenceRoot, 'conflict-seed'), session }) : null;
    const initial = assertMacosAcceptanceSyncGroupServer(await session.enable());
    const beforeJoinRun = twoDevice ? await session.loadSyncTriggerResult() : null;
    const initialOrigins = journeyOrigins(await session.invoke('load_workspace_list_snapshot', {
      includePdfOpenings: false
    }));
    const requiredInitial = twoDevice ? ['A'] : ['A', 'B', 'C'];
    if (!requiredInitial.every((origin) => initialOrigins.includes(origin))) {
      throw new Error(`Mac provider is missing pre-Fri facts: ${initialOrigins.join(',')}`);
    }
    const ready = { groupId: initial.sync_group.group_id,
      groupTag: initial.sync_group.group_tag,
      resultStatus: 'ready', serverStatus: initial.server_status };
    writeJson(receiptPath, ready); onState(ready);
    console.log(`[fri-sync-group-provider] ready receipt=${receiptPath}`);
    const request = await waitForMacosDeviceRequest(session, null, { timeoutMs: 10 * 60_000 });
    await session.accept(request.request_id);
    const accepted = await waitForDeviceCount(session, twoDevice ? 2 : 4);
    const automaticFact = twoDevice ? await createDesktopSyncGroupJourneyFact({ device: 'A',
      evidenceRoot: path.join(evidenceRoot, 'macos-automatic-fact'), session }) : null;
    const acceptedState = { acceptedDeviceName: request.device_name,
      acceptedRequestId: request.request_id, deviceCount: accepted.sync_group.devices.length,
      groupId: accepted.sync_group.group_id, groupTag: accepted.sync_group.group_tag,
      resultStatus: 'accepted' };
    writeJson(receiptPath, acceptedState); onState(acceptedState);
    console.log(`[fri-sync-group-provider] accepted request=${request.request_id}`);
    const origins = await waitForJourneyOrigin(session, twoDevice ? 'B' : 'D', twoDevice ? 2 : 1);
    let macosRestarted = false;
    let idempotent = false;
    let runs;
    let conflict;
    if (twoDevice) {
      const beforeRestart = await session.invoke('load_workspace_list_snapshot', {
        includePdfOpenings: false
      });
      const automaticBeforeRestart = await waitForMacosAutomaticRun(session, beforeJoinRun?.run_id);
      await session.invoke('pause_companion_sync');
      await forkDesktopSyncConflict({ label: 'macos', nodeId: conflictSeed.nodeId, session });
      const conflictReady = { groupId: accepted.sync_group.group_id,
        groupTag: accepted.sync_group.group_tag, resultStatus: 'conflict-fork-ready' };
      onState(conflictReady);
      console.log('[fri-sync-group-provider] conflict-fork-ready');
      await waitForRelease();
      await session.invoke('resume_companion_sync');
      const manualBeforeRestart = await session.invoke('sync_companion_now');
      conflict = await loadVisibleDesktopSyncConflict({ nodeId: conflictSeed.nodeId, session });
      await session.close();
      session = await openSession();
      const restarted = await session.load();
      if (restarted.sync_group?.group_id !== accepted.sync_group.group_id) {
        throw new Error('Mac did not restore its Fri Sync Group.');
      }
      const automaticAfterRestart = await waitForMacosAutomaticRun(
        session, manualBeforeRestart?.run_id
      );
      const manualAfterRestart = await session.invoke('sync_companion_now');
      const afterRestart = await session.invoke('load_workspace_list_snapshot', {
        includePdfOpenings: false
      });
      if (Object.keys(afterRestart.nodesById).length !== Object.keys(beforeRestart.nodesById).length) {
        throw new Error('Repeated Mac and Fri sync was not idempotent.');
      }
      macosRestarted = true;
      idempotent = true;
      runs = { automaticAfterRestart, automaticBeforeRestart,
        manualAfterRestart, manualBeforeRestart };
    }
    const converged = { acceptedDeviceName: request.device_name,
      acceptedRequestId: request.request_id, deviceCount: accepted.sync_group.devices.length,
      groupId: accepted.sync_group.group_id, groupTag: accepted.sync_group.group_tag,
      idempotent, journeyOrigins: origins,
      journeyFactIds: twoDevice ? [initialFact.factId, automaticFact.factId] : undefined,
      macosRestarted, conflict, runs,
      resultStatus: 'automatic-converged' };
    writeJson(receiptPath, converged); onState(converged);
    console.log(`[fri-sync-group-provider] automatic-converged origin=${twoDevice ? 'B' : 'D'}`);
    const signal = twoDevice ? 'consumer_complete' : await waitForRelease();
    const completed = { acceptedDeviceName: request.device_name,
      acceptedRequestId: request.request_id, deviceCount: accepted.sync_group.devices.length,
      groupId: accepted.sync_group.group_id, groupTag: accepted.sync_group.group_tag,
      idempotent, journeyOrigins: origins,
      journeyFactIds: twoDevice ? [initialFact.factId, automaticFact.factId] : undefined,
      localDeviceIdentityKey: accepted.sync_group.local_device_identity_key,
      libraryLocator: path.join(acceptanceRoot, 'macos-library'),
      macosRestarted, conflict, runs,
      resultStatus: 'success', stoppedBy: signal };
    writeJson(receiptPath, completed); onState(completed);
    return { receipt: completed, receiptPath };
  } finally {
    await session.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const evidenceRoot = option(process.argv.slice(2), '--evidence-root');
  if (!evidenceRoot) throw new Error('--evidence-root is required');
  const acceptanceRoot = option(process.argv.slice(2), '--acceptance-root');
  await runFriSyncGroupProvider({ acceptanceRoot: acceptanceRoot
    ? path.resolve(acceptanceRoot) : path.resolve(evidenceRoot),
  evidenceRoot: path.resolve(evidenceRoot),
  twoDevice: process.env.FOLIOLE_T152_TWO_DEVICE === '1' });
}
