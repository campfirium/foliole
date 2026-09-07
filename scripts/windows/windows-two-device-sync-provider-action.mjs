import fs from 'node:fs';
import path from 'node:path';

import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import {
  createDesktopSyncConflictSeed, forkDesktopSyncConflict
} from '../desktop/sync-group-conflict-action.mjs';
import { waitForWindowsSyncGroupProviderRelease } from './windows-sync-group-provider-release.mjs';
import { provisionWindowsAcceptanceRoot } from './windows-multi-device-sync-readiness.mjs';
import {
  invokeWindowsSyncGroupCommand, openWindowsSyncGroupSession, windowsSyncGroupClientPaths
} from './windows-sync-group-recovery-action.mjs';
import { closeWindowsSyncGroupSession } from './windows-sync-group-session-close.mjs';
import {
  waitForDesktopProductEvent, waitForDesktopProductState
} from '../acceptance/desktop-product-event.mjs';

/* global process */

const ACTION = 'two-device-sync-provider';

async function waitForOverview(page, predicate, label, timeoutMs = 5 * 60_000) {
  const overview = await waitForDesktopProductState(page, { command: 'load_sync_group_overview',
    condition: label === 'one Device join request'
      ? { count: 1, kind: 'join-request-count' }
      : { deviceCount: 2, groupId: label, kind: 'group' },
    eventName: label === 'one Device join request'
      ? 'onSyncGroupJoinRequestsChanged' : 'onSyncGroupDiscoveryChanged', timeoutMs });
  if (!predicate(overview)) throw new Error(`Windows product state did not prove ${label}.`);
  return overview;
}

async function waitForOrigins(page, expected, counts = {}, timeoutMs = 5 * 60_000) {
  const required = Object.fromEntries(expected.map((origin) => [
    `Multi-device sync ${origin} fact`, counts[origin] ?? 1
  ]));
  return waitForDesktopProductState(page, { command: 'load_workspace_list_snapshot',
    commandArgs: { includePdfOpenings: false },
    condition: { counts: required, kind: 'fact-prefix-counts' },
    eventName: 'onWorkspaceSyncApplied', timeoutMs });
}

function report(reportProgress, milestone, groupId, groupTag) {
  reportProgress({ factId: 'two-device-sync', milestone,
    ...(groupId ? { groupId, groupTag } : {}) });
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

async function waitForAutomaticSync(session, previousRunId, timeoutMs = 3 * 60_000) {
  let result = await loadSyncTriggerResult(session.app);
  if (result?.run_id !== previousRunId && result?.reason === 'automatic'
      && result?.status === 'completed') return result;
  await waitForDesktopProductEvent(session.page, 'onWorkspaceSyncApplied', { timeoutMs });
  result = await loadSyncTriggerResult(session.app);
  if (result?.run_id !== previousRunId && result?.reason === 'automatic'
      && result?.status === 'completed') return result;
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
  let groupTag;
  let creatorFact;
  let automaticFact;
  let automaticResult;
  let manualBeforeRestart;
  let conflictProof;
  let conflictSeed;
  let acceptedRequestId;
  try {
    creatorFact = await createDesktopSyncGroupJourneyFact({ device: 'A',
      evidenceRoot: path.join(options.evidenceRoot, 'creator-fact'), session: {
        invoke: (command, args) => invokeWindowsSyncGroupCommand(session.page, command, args)
      } });
    conflictSeed = await createDesktopSyncConflictSeed({
      evidenceRoot: path.join(options.evidenceRoot, 'conflict-seed'), session: {
        invoke: (command, args) => invokeWindowsSyncGroupCommand(session.page, command, args)
      }
    });
    const created = await invokeWindowsSyncGroupCommand(session.page, 'create_sync_group');
    groupId = created.sync_group?.group_id;
    groupTag = created.sync_group?.group_tag;
    if (!groupId || !/^[0-9a-f]{32}$/u.test(groupTag ?? '')
        || created.sync_group.devices.length !== 1) {
      throw new Error('Windows did not create an isolated one-Device Sync Group.');
    }
    report(options.reportProgress, 'provider-ready', groupId, groupTag);
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
    automaticResult = await waitForAutomaticSync(session, beforeAutomatic?.run_id);
    report(options.reportProgress, 'automatic-converged');
    await invokeWindowsSyncGroupCommand(session.page, 'pause_companion_sync');
    await forkDesktopSyncConflict({ label: 'windows', nodeId: conflictSeed.nodeId,
      session: { invoke: (command, args) => invokeWindowsSyncGroupCommand(
        session.page, command, args
      ) } });
    report(options.reportProgress, 'conflict-fork-ready');
    await waitForWindowsSyncGroupProviderRelease({ action: ACTION,
      repoRoot: options.paths.repoRoot });
    await invokeWindowsSyncGroupCommand(session.page, 'resume_companion_sync');
    manualBeforeRestart = await invokeWindowsSyncGroupCommand(session.page, 'sync_companion_now');
    const conflicts = await waitForDesktopProductState(session.page, {
      command: 'load_sync_node_conflicts', commandArgs: { objectIds: [conflictSeed.nodeId] },
      condition: { count: 1, kind: 'sync-conflict-count' },
      eventName: 'onWorkspaceSyncApplied', timeoutMs: 2 * 60_000
    });
    conflictProof = { conflictCount: conflicts.length, nodeId: conflictSeed.nodeId,
      silentOverwrite: false, visible: true };
  } finally {
    await closeWindowsSyncGroupSession(session);
  }
  session = await openWindowsSyncGroupSession(options.paths, options.evidenceRoot);
  let restarted;
  let manualAfterRestart;
  try {
    restarted = await waitForOverview(session.page,
      (value) => value.sync_group?.group_id === groupId
        && value.sync_group.devices.length === 2, groupId);
    const beforeRepeat = await waitForOrigins(session.page, ['A', 'B']);
    const restartedAutomatic = await waitForAutomaticSync(session, automaticResult?.run_id);
    manualAfterRestart = await invokeWindowsSyncGroupCommand(session.page, 'sync_companion_now');
    const afterRepeat = await waitForOrigins(session.page, ['A', 'B']);
    if (Object.keys(afterRepeat.nodesById).length !== Object.keys(beforeRepeat.nodesById).length) {
      throw new Error('Repeated Windows provider sync was not idempotent.');
    }
    report(options.reportProgress, 'restarted');
    automaticResult = { afterRestart: restartedAutomatic, beforeRestart: automaticResult };
  } finally {
    await closeWindowsSyncGroupSession(session);
  }
  const manifestPath = path.join(options.evidenceRoot, `${ACTION}-receipt.json`);
  fs.writeFileSync(manifestPath, `${JSON.stringify({ acceptedRequestId,
    buildIdentity: options.buildIdentity, completedAt: new Date().toISOString(),
    creatorFactId: creatorFact.factId, deviceCount: restarted.sync_group.devices.length,
    automaticFactId: automaticFact.factId, groupId, groupTag, idempotent: true,
    automaticRunIds: { afterRestart: automaticResult.afterRestart.run_id,
      beforeRestart: automaticResult.beforeRestart.run_id },
    localDeviceIdentityKey: restarted.sync_group.local_device_identity_key,
    libraryLocator: client.libraryHome, freshWorkspace: true,
    runs: { automaticAfterRestart: automaticResult.afterRestart,
      automaticBeforeRestart: automaticResult.beforeRestart,
      manualAfterRestart, manualBeforeRestart },
    journeyOrigins: ['A', 'B'],
    conflict: conflictProof,
    resultStatus: 'success', schemaVersion: 1
  }, null, 2)}\n`, 'utf8');
  return { output: '', twoDeviceSyncProvider: { manifestPath } };
}
