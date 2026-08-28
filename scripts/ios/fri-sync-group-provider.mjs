#!/usr/bin/env node
/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

import {
  openMacosSyncGroupDesktopSession,
  waitForMacosDeviceRequest
} from '../android/macos-sync-group-desktop-session.mjs';
import {
  assertMacosAcceptanceSyncGroupServer, macosAcceptanceEnv
} from '../sync-group/multi-device-sync-macos-channel.mjs';
import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import {
  readSyncGroupControllerState,
  waitForSyncGroupAutomaticRun
} from '../desktop/sync-group-controller-read.mjs';

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
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const overview = await readSyncGroupControllerState(() => session.load());
    if (overview.sync_group?.devices?.length >= count) return overview;
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${count} Sync Group Devices.`);
}

function journeyOrigins(snapshot) {
  return [...new Set(Object.values(snapshot?.nodesById ?? {}).flatMap(({ title }) => {
    const match = String(title).match(/^Multi-device sync ([ABCD]) fact/u);
    return match ? [match[1]] : [];
  }))].sort();
}

async function waitForJourneyOrigin(session, origin, count = 1, timeoutMs = 5 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await readSyncGroupControllerState(() => session.invoke(
      'load_workspace_list_snapshot', { includePdfOpenings: false }
    ));
    const origins = journeyOrigins(snapshot);
    const matches = Object.values(snapshot?.nodesById ?? {}).filter(({ title }) =>
      String(title).startsWith(`Multi-device sync ${origin} fact`));
    if (matches.length >= count) return origins;
    await delay(250);
  }
  throw new Error(`Timed out waiting for the ${origin} business fact.`);
}

export async function runFriSyncGroupProvider({ acceptanceRoot = evidenceRoot,
  evidenceRoot, repoRoot = process.cwd(), twoDevice = false,
  waitForRelease = waitForStop }) {
  const openSession = () => openMacosSyncGroupDesktopSession({
    env: macosAcceptanceEnv(), libraryHome: path.join(acceptanceRoot, 'macos-library'), repoRoot,
    runtimeRoot: path.join(acceptanceRoot, 'macos-runtime')
  });
  let session = await openSession();
  const receiptPath = path.join(evidenceRoot, 'provider-receipt.json');
  try {
    const initialFact = twoDevice ? await createDesktopSyncGroupJourneyFact({ device: 'A',
      evidenceRoot: path.join(evidenceRoot, 'macos-initial-fact'), session }) : null;
    const initial = assertMacosAcceptanceSyncGroupServer(await session.enable());
    const initialOrigins = journeyOrigins(await session.invoke('load_workspace_list_snapshot', {
      includePdfOpenings: false
    }));
    const requiredInitial = twoDevice ? ['A'] : ['A', 'B', 'C'];
    if (!requiredInitial.every((origin) => initialOrigins.includes(origin))) {
      throw new Error(`Mac provider is missing pre-Fri facts: ${initialOrigins.join(',')}`);
    }
    writeJson(receiptPath, { groupId: initial.sync_group.group_id,
      resultStatus: 'ready', serverStatus: initial.server_status });
    console.log(`[fri-sync-group-provider] ready receipt=${receiptPath}`);
    const request = await waitForMacosDeviceRequest(session, null, { timeoutMs: 10 * 60_000 });
    await session.accept(request.request_id);
    const accepted = await waitForDeviceCount(session, twoDevice ? 2 : 4);
    const automaticFact = twoDevice ? await createDesktopSyncGroupJourneyFact({ device: 'A',
      evidenceRoot: path.join(evidenceRoot, 'macos-automatic-fact'), session }) : null;
    writeJson(receiptPath, { acceptedDeviceName: request.device_name,
      acceptedRequestId: request.request_id, deviceCount: accepted.sync_group.devices.length,
      groupId: accepted.sync_group.group_id, resultStatus: 'accepted' });
    console.log(`[fri-sync-group-provider] accepted request=${request.request_id}`);
    const origins = await waitForJourneyOrigin(session, twoDevice ? 'B' : 'D', twoDevice ? 2 : 1);
    let macosRestarted = false;
    let idempotent = false;
    if (twoDevice) {
      const beforeRestart = await session.invoke('load_workspace_list_snapshot', {
        includePdfOpenings: false
      });
      const beforeRestartAutomatic = await readSyncGroupControllerState(
        () => session.loadSyncTriggerResult()
      );
      await session.close();
      session = await openSession();
      const restarted = await session.load();
      if (restarted.sync_group?.group_id !== accepted.sync_group.group_id) {
        throw new Error('Mac did not restore its Fri Sync Group.');
      }
      await waitForSyncGroupAutomaticRun(
        () => session.loadSyncTriggerResult(), beforeRestartAutomatic?.run_id
      );
      await session.invoke('sync_companion_now');
      await session.invoke('sync_companion_now');
      const afterRestart = await session.invoke('load_workspace_list_snapshot', {
        includePdfOpenings: false
      });
      if (Object.keys(afterRestart.nodesById).length !== Object.keys(beforeRestart.nodesById).length) {
        throw new Error('Repeated Mac and Fri sync was not idempotent.');
      }
      macosRestarted = true;
      idempotent = true;
    }
    writeJson(receiptPath, { acceptedDeviceName: request.device_name,
      acceptedRequestId: request.request_id, deviceCount: accepted.sync_group.devices.length,
      groupId: accepted.sync_group.group_id, idempotent, journeyOrigins: origins,
      journeyFactIds: twoDevice ? [initialFact.factId, automaticFact.factId] : undefined,
      macosRestarted,
      resultStatus: 'automatic-converged' });
    console.log(`[fri-sync-group-provider] automatic-converged origin=${twoDevice ? 'B' : 'D'}`);
    const signal = await waitForRelease();
    writeJson(receiptPath, { acceptedDeviceName: request.device_name,
      acceptedRequestId: request.request_id, deviceCount: accepted.sync_group.devices.length,
      groupId: accepted.sync_group.group_id, idempotent, journeyOrigins: origins,
      journeyFactIds: twoDevice ? [initialFact.factId, automaticFact.factId] : undefined,
      macosRestarted,
      resultStatus: 'success', stoppedBy: signal });
  } finally {
    await session.close();
  }
  return { receiptPath };
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
