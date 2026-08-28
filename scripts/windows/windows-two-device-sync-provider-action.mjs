import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import { waitForWindowsSyncGroupProviderRelease } from './windows-sync-group-provider-release.mjs';
import { provisionWindowsAcceptanceRoot } from './windows-multi-device-sync-readiness.mjs';
import {
  invokeWindowsSyncGroupCommand, openWindowsSyncGroupSession, windowsSyncGroupClientPaths
} from './windows-sync-group-recovery-action.mjs';
import { closeWindowsSyncGroupSession } from './windows-sync-group-session-close.mjs';

/* global process */

const ACTION = 'two-device-sync-provider';

function origins(snapshot) {
  return [...new Set(Object.values(snapshot?.nodesById ?? {}).flatMap(({ title }) => {
    const match = String(title).match(/^Multi-device sync ([AB]) fact/u);
    return match ? [match[1]] : [];
  }))].sort();
}

function originCount(snapshot, origin) {
  return Object.values(snapshot?.nodesById ?? {}).filter(({ title }) =>
    String(title).startsWith(`Multi-device sync ${origin} fact`)).length;
}

async function waitForOverview(page, predicate, label, timeoutMs = 5 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  let overview;
  while (Date.now() < deadline) {
    overview = await invokeWindowsSyncGroupCommand(page, 'load_sync_group_overview');
    if (predicate(overview)) return overview;
    await delay(250);
  }
  throw new Error(`Windows timed out waiting for ${label}: ${JSON.stringify(overview)}`);
}

async function waitForOrigins(page, expected, counts = {}, timeoutMs = 5 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  let snapshot;
  while (Date.now() < deadline) {
    snapshot = await invokeWindowsSyncGroupCommand(page, 'load_workspace_list_snapshot', {
      includePdfOpenings: false
    });
    if (expected.every((origin) => origins(snapshot).includes(origin))
        && Object.entries(counts).every(([origin, count]) =>
          originCount(snapshot, origin) >= count)) return snapshot;
    await delay(250);
  }
  throw new Error(`Windows business facts did not converge: ${origins(snapshot).join(',')}`);
}

function report(reportProgress, milestone) {
  reportProgress({ factId: 'two-device-sync', milestone });
}

async function loadSyncTriggerResult(app) {
  return app.evaluate(({ app: electronApp }) => {
    const pathApi = process.getBuiltinModule('node:path');
    const moduleApi = process.getBuiltinModule('node:module');
    const loadModule = moduleApi.createRequire(pathApi.join(electronApp.getAppPath(), 'main.js'));
    return loadModule(pathApi.join(
      electronApp.getAppPath(), 'sync', 'desktopSyncCoordinator.js'
    )).loadDesktopSyncTriggerResult();
  });
}

async function waitForAutomaticSync(app, previousRunId, timeoutMs = 3 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  let result;
  while (Date.now() < deadline) {
    result = await loadSyncTriggerResult(app);
    if (result?.run_id !== previousRunId && result?.reason === 'automatic'
        && result?.status === 'completed') return result;
    await delay(250);
  }
  throw new Error(`Windows automatic sync did not complete: ${JSON.stringify(result)}`);
}

export async function runWindowsTwoDeviceSyncProvider(options) {
  provisionWindowsAcceptanceRoot({ paths: options.paths });
  const client = windowsSyncGroupClientPaths(options.paths);
  fs.rmSync(path.dirname(client.libraryHome), { force: true, recursive: true });
  fs.mkdirSync(client.libraryHome, { recursive: true });
  fs.mkdirSync(client.userData, { recursive: true });
  let session = await openWindowsSyncGroupSession(options.paths, options.evidenceRoot);
  let groupId;
  let creatorFact;
  let automaticFact;
  let acceptedRequestId;
  try {
    creatorFact = await createDesktopSyncGroupJourneyFact({ device: 'A',
      evidenceRoot: path.join(options.evidenceRoot, 'creator-fact'), session: {
        invoke: (command, args) => invokeWindowsSyncGroupCommand(session.page, command, args)
      } });
    const created = await invokeWindowsSyncGroupCommand(session.page, 'create_sync_group');
    groupId = created.sync_group?.group_id;
    if (!groupId || created.sync_group.devices.length !== 1) {
      throw new Error('Windows did not create an isolated one-Device Sync Group.');
    }
    report(options.reportProgress, 'provider-ready');
    const requested = await waitForOverview(session.page,
      (value) => value.join_requests?.length === 1, 'one Device join request');
    const request = requested.join_requests[0];
    if (Object.hasOwn(request, 'workgroup_key') || JSON.stringify(request).includes('workgroup_key')) {
      throw new Error('Pending Device request exposed the Sync Group key.');
    }
    acceptedRequestId = request.request_id;
    report(options.reportProgress, 'request-pending');
    const accepted = await invokeWindowsSyncGroupCommand(session.page,
      'accept_sync_group_join_request', { request_id: acceptedRequestId });
    if (accepted.sync_group?.devices?.length !== 2) {
      throw new Error('Windows did not persist the joining Device.');
    }
    report(options.reportProgress, 'accepted');
    const beforeAutomatic = await loadSyncTriggerResult(session.app);
    automaticFact = await createDesktopSyncGroupJourneyFact({ device: 'A',
      evidenceRoot: path.join(options.evidenceRoot, 'automatic-fact'), session: {
        invoke: (command, args) => invokeWindowsSyncGroupCommand(session.page, command, args)
      } });
    await waitForOrigins(session.page, ['A', 'B'], { B: 2 });
    await waitForAutomaticSync(session.app, beforeAutomatic?.run_id);
    report(options.reportProgress, 'automatic-converged');
    await waitForWindowsSyncGroupProviderRelease({ action: ACTION,
      repoRoot: options.paths.repoRoot });
  } finally {
    await closeWindowsSyncGroupSession(session);
  }
  session = await openWindowsSyncGroupSession(options.paths, options.evidenceRoot);
  let restarted;
  try {
    restarted = await waitForOverview(session.page,
      (value) => value.sync_group?.group_id === groupId
        && value.sync_group.devices.length === 2, 'restarted two-Device Sync Group');
    const beforeRepeat = await waitForOrigins(session.page, ['A', 'B']);
    await invokeWindowsSyncGroupCommand(session.page, 'sync_companion_now');
    await invokeWindowsSyncGroupCommand(session.page, 'sync_companion_now');
    const afterRepeat = await waitForOrigins(session.page, ['A', 'B']);
    if (Object.keys(afterRepeat.nodesById).length !== Object.keys(beforeRepeat.nodesById).length) {
      throw new Error('Repeated Windows provider sync was not idempotent.');
    }
    report(options.reportProgress, 'restarted');
  } finally {
    await closeWindowsSyncGroupSession(session);
  }
  const manifestPath = path.join(options.evidenceRoot, `${ACTION}-receipt.json`);
  fs.writeFileSync(manifestPath, `${JSON.stringify({ acceptedRequestId,
    buildIdentity: options.buildIdentity, completedAt: new Date().toISOString(),
    creatorFactId: creatorFact.factId, deviceCount: restarted.sync_group.devices.length,
    automaticFactId: automaticFact.factId, groupId, idempotent: true,
    journeyOrigins: ['A', 'B'],
    resultStatus: 'success', schemaVersion: 1
  }, null, 2)}\n`, 'utf8');
  return { output: '', twoDeviceSyncProvider: { manifestPath } };
}
