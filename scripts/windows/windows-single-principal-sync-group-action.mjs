/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { provisionWindowsAcceptanceRoot } from './windows-multi-device-sync-readiness.mjs';
import {
  discoverUniqueGroup, invokeWindowsSyncGroupCommand, openWindowsSyncGroupSession,
  windowsSyncGroupClientPaths
} from './windows-sync-group-recovery-action.mjs';
import { closeWindowsSyncGroupSession } from './windows-sync-group-session-close.mjs';
import {
  assertJoinedWindowsGroup
} from './windows-single-principal-sync-group-contract.mjs';
import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';

function hasJourneyOrigins(snapshot, origins) {
  const titles = Object.values(snapshot?.nodesById ?? {}).map(({ title }) => title);
  return origins.every((origin) => titles.some((title) =>
    String(title).startsWith(`Multi-device sync ${origin} fact`)));
}

function journeyOriginCount(snapshot, origin) {
  return Object.values(snapshot?.nodesById ?? {}).filter(({ title }) =>
    String(title).startsWith(`Multi-device sync ${origin} fact`)).length;
}

async function waitForJourneyOrigins(page, origins, timeoutMs = 2 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  let snapshot;
  while (Date.now() < deadline) {
    try {
      snapshot = await invokeWindowsSyncGroupCommand(page, 'load_workspace_list_snapshot', {
        includePdfOpenings: false
      });
    } catch (error) {
      if (!String(error?.message).includes('sqlite connection is owned')) throw error;
      await delay(500);
      continue;
    }
    if (hasJourneyOrigins(snapshot, origins)) return snapshot;
    await delay(500);
  }
  throw new Error(`Windows business facts did not converge: ${origins.join(',')}`);
}

async function waitForJourneyOriginCount(page, origin, count, timeoutMs = 2 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  let snapshot;
  while (Date.now() < deadline) {
    try {
      snapshot = await invokeWindowsSyncGroupCommand(page, 'load_workspace_list_snapshot', {
        includePdfOpenings: false
      });
    } catch (error) {
      if (!String(error?.message).includes('sqlite connection is owned')) throw error;
      await delay(500);
      continue;
    }
    if (journeyOriginCount(snapshot, origin) >= count) return snapshot;
    await delay(500);
  }
  throw new Error(`Windows did not receive ${count} ${origin} business facts automatically.`);
}

async function loadSyncTriggerResult(app) {
  return app.evaluate(({ app: electronApp }) => {
    const pathApi = process.getBuiltinModule('node:path');
    const moduleApi = process.getBuiltinModule('node:module');
    if (!pathApi || !moduleApi) throw new Error('Node built-ins unavailable.');
    const loadModule = moduleApi.createRequire(pathApi.join(electronApp.getAppPath(), 'main.js'));
    return loadModule(pathApi.join(
      electronApp.getAppPath(), 'sync', 'desktopSyncCoordinator.js'
    )).loadDesktopSyncTriggerResult();
  });
}

async function waitForAutomaticSync(app, previousRunId, timeoutMs = 2 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  let result;
  while (Date.now() < deadline) {
    try { result = await loadSyncTriggerResult(app); }
    catch (error) {
      if (!String(error?.message).includes('sqlite connection is owned')) throw error;
      await delay(500);
      continue;
    }
    if (result?.run_id !== previousRunId && result?.reason === 'automatic'
        && result?.status === 'completed') return result;
    await delay(500);
  }
  throw new Error(`Windows automatic sync did not complete: ${JSON.stringify(result)}`);
}

async function retryWhileDatabaseOwned(action, timeoutMs = 2 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try { return await action(); }
    catch (error) {
      if (!String(error?.message).includes('sqlite connection is owned')) throw error;
      lastError = error;
      await delay(500);
    }
  }
  throw lastError ?? new Error('Windows database owner did not become available.');
}

async function completeAcceptedJoin(page, timeoutMs = 10 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try { return await invokeWindowsSyncGroupCommand(page, 'complete_sync_group_join'); }
    catch (error) {
      lastError = error;
      await delay(500);
    }
  }
  throw new Error(`Windows Device acceptance timed out: ${lastError?.message ?? 'unknown'}`);
}

export async function runWindowsSinglePrincipalSyncGroup(options) {
  provisionWindowsAcceptanceRoot({ paths: options.paths });
  const client = windowsSyncGroupClientPaths(options.paths);
  fs.rmSync(path.dirname(client.libraryHome), { force: true, recursive: true });
  fs.mkdirSync(client.libraryHome, { recursive: true });
  fs.mkdirSync(client.userData, { recursive: true });
  let session = await openWindowsSyncGroupSession(options.paths, options.evidenceRoot);
  let candidate;
  let firstGroup;
  let localFact;
  let automaticFact;
  let automaticResult;
  try {
    localFact = await retryWhileDatabaseOwned(() => createDesktopSyncGroupJourneyFact({
      device: 'C', evidenceRoot: path.join(options.evidenceRoot, 'windows-fact'),
      session: { invoke: (command, args) => invokeWindowsSyncGroupCommand(session.page, command, args) }
    }));
    await invokeWindowsSyncGroupCommand(session.page, 'enable_companion_sync');
    candidate = await discoverUniqueGroup(session.page);
    await invokeWindowsSyncGroupCommand(session.page, 'request_sync_group_join', {
      endpoint_url: candidate.endpoint_url
    });
    console.log(`[windows-dev-action] progress action=single-principal-sync-group milestone=requested group=${candidate.group_id}`);
    firstGroup = assertJoinedWindowsGroup(await completeAcceptedJoin(session.page), candidate.group_id);
    const beforeAutomatic = await retryWhileDatabaseOwned(() => loadSyncTriggerResult(session.app));
    automaticFact = await retryWhileDatabaseOwned(() => createDesktopSyncGroupJourneyFact({
      device: 'C', evidenceRoot: path.join(options.evidenceRoot, 'windows-automatic-fact'),
      session: { invoke: (command, args) => invokeWindowsSyncGroupCommand(session.page, command, args) }
    }));
    automaticResult = await waitForAutomaticSync(session.app, beforeAutomatic?.run_id);
    await invokeWindowsSyncGroupCommand(session.page, 'sync_companion_now');
    await waitForJourneyOrigins(session.page, ['A', 'C']);
    await waitForJourneyOriginCount(session.page, 'A', 2);
  } finally { await closeWindowsSyncGroupSession(session); }
  session = await openWindowsSyncGroupSession(options.paths, options.evidenceRoot);
  let restartedGroup;
  try {
    restartedGroup = assertJoinedWindowsGroup(await invokeWindowsSyncGroupCommand(
      session.page, 'load_sync_group_overview'
    ), candidate.group_id);
    await waitForJourneyOrigins(session.page, ['A', 'C']);
  } finally { await closeWindowsSyncGroupSession(session); }
  const manifestPath = path.join(options.evidenceRoot,
    'single-principal-sync-group-receipt.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify({ buildIdentity: options.buildIdentity,
    completedAt: new Date().toISOString(), deviceCount: restartedGroup.devices.length,
    groupId: restartedGroup.group_id,
    localDeviceIdentityKey: restartedGroup.local_device_identity_key,
    localDevicePersisted: firstGroup.local_device_identity_key
      === restartedGroup.local_device_identity_key,
    automaticFactId: automaticFact.factId, automaticRunId: automaticResult.run_id,
    journeyFactId: localFact.factId, journeyOrigins: ['A', 'C'],
    resultStatus: 'success', schemaVersion: 2
  }, null, 2)}\n`, 'utf8');
  return { output: '', singlePrincipalSyncGroup: { manifestPath } };
}
