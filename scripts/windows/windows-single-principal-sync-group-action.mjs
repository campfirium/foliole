/* global console, process */

import fs from 'node:fs';
import path from 'node:path';

import { provisionWindowsAcceptanceRoot } from './windows-multi-device-sync-readiness.mjs';
import {
  invokeWindowsSyncGroupCommand, openWindowsSyncGroupSession,
  windowsSyncGroupClientPaths
} from './windows-sync-group-recovery-action.mjs';
import { closeWindowsSyncGroupSession } from './windows-sync-group-session-close.mjs';
import { waitForWindowsSyncGroupProviderRelease } from './windows-sync-group-provider-release.mjs';
import {
  assertJoinedWindowsGroup
} from './windows-single-principal-sync-group-contract.mjs';
import { createDesktopSyncGroupJourneyFact } from '../desktop/sync-group-journey-fact-action.mjs';
import { forkDesktopSyncConflict } from '../desktop/sync-group-conflict-action.mjs';
import {
  waitForDesktopProductEvent, waitForDesktopProductState
} from '../acceptance/desktop-product-event.mjs';

async function waitForJourneyOrigins(page, origins, timeoutMs = 2 * 60_000) {
  return waitForDesktopProductState(page, { command: 'load_workspace_list_snapshot',
    commandArgs: { includePdfOpenings: false }, condition: {
      counts: Object.fromEntries(origins.map((origin) =>
        [`Multi-device sync ${origin} fact`, 1])), kind: 'fact-prefix-counts'
    }, eventName: 'onWorkspaceSyncApplied', timeoutMs });
}

async function waitForJourneyOriginCount(page, origin, count, timeoutMs = 2 * 60_000) {
  return waitForDesktopProductState(page, { command: 'load_workspace_list_snapshot',
    commandArgs: { includePdfOpenings: false }, condition: {
      counts: { [`Multi-device sync ${origin} fact`]: count }, kind: 'fact-prefix-counts'
    }, eventName: 'onWorkspaceSyncApplied', timeoutMs });
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

async function waitForAutomaticSync(session, previousRunId, timeoutMs = 2 * 60_000) {
  let result = await loadSyncTriggerResult(session.app);
  if (result?.run_id !== previousRunId && result?.reason === 'automatic'
      && result?.status === 'completed') return result;
  await waitForDesktopProductEvent(session.page, 'onWorkspaceSyncApplied', { timeoutMs });
  result = await loadSyncTriggerResult(session.app);
  if (result?.run_id !== previousRunId && result?.reason === 'automatic'
      && result?.status === 'completed') return result;
  throw new Error(`Windows automatic sync did not complete: ${JSON.stringify(result)}`);
}

async function discoverExpectedGroup(page, identity, timeoutMs = 2 * 60_000) {
  const overview = await waitForDesktopProductState(page, { command: 'load_sync_group_overview',
    condition: { ...identity, kind: 'candidate-identity' }, eventName: 'onSyncGroupDiscoveryChanged',
    timeoutMs, triggerCommand: 'discover_sync_groups' });
  const matches = overview.join_candidates.filter((candidate) =>
    candidate.group_id === identity.groupId && candidate.group_tag === identity.groupTag);
  if (matches.length !== 1) throw new Error('Expected Mac Sync Group discovery was not unique.');
  return matches[0];
}

async function completeAcceptedJoin(page, groupId, timeoutMs = 10 * 60_000) {
  await waitForDesktopProductEvent(page, 'onSyncGroupDiscoveryChanged', { timeoutMs });
  const overview = await invokeWindowsSyncGroupCommand(page, 'complete_sync_group_join');
  return assertJoinedWindowsGroup(overview, groupId);
}

function report(reportProgress, milestone) {
  reportProgress({ factId: 'single-principal-sync-group', milestone });
}

async function conflictSeed(page) {
  const snapshot = await invokeWindowsSyncGroupCommand(page, 'load_workspace_list_snapshot', {
    includePdfOpenings: false
  });
  const matches = Object.values(snapshot.nodesById ?? {}).filter(({ title }) =>
    String(title).startsWith('T152 conflict t152-conflict-'));
  if (matches.length !== 1) throw new Error('Windows did not receive one exact conflict seed.');
  return matches[0].id ?? matches[0].nodeId;
}

export async function runWindowsSinglePrincipalSyncGroup(options) {
  if (!/^group-[0-9a-f-]{36}$/u.test(options.expectedGroupId ?? '')) {
    throw new Error('Windows joiner requires the exact Mac-created Sync Group id.');
  }
  if (!/^[0-9a-f]{32}$/u.test(options.expectedGroupTag ?? '')) {
    throw new Error('Windows joiner requires the exact Mac-created Sync Group tag.');
  }
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
  let initialResult;
  let manualBeforeRestart;
  let conflictProof;
  try {
    localFact = await createDesktopSyncGroupJourneyFact({
      device: 'C', evidenceRoot: path.join(options.evidenceRoot, 'windows-fact'),
      session: { invoke: (command, args) => invokeWindowsSyncGroupCommand(session.page, command, args) }
    });
    await invokeWindowsSyncGroupCommand(session.page, 'enable_companion_sync');
    candidate = await discoverExpectedGroup(session.page, {
      groupId: options.expectedGroupId, groupTag: options.expectedGroupTag
    });
    await invokeWindowsSyncGroupCommand(session.page, 'request_sync_group_join', {
      endpoint_url: candidate.endpoint_url
    });
    console.log(`[windows-dev-action] requested group=${candidate.group_id}`);
    report(options.reportProgress, 'requested');
    firstGroup = await completeAcceptedJoin(session.page, candidate.group_id);
    initialResult = await loadSyncTriggerResult(session.app);
    if (initialResult?.reason !== 'initial' || initialResult?.status !== 'completed') {
      throw new Error(`Windows initial sync did not complete: ${JSON.stringify(initialResult)}`);
    }
    const beforeAutomatic = initialResult;
    automaticFact = await createDesktopSyncGroupJourneyFact({
      device: 'C', evidenceRoot: path.join(options.evidenceRoot, 'windows-automatic-fact'),
      session: { invoke: (command, args) => invokeWindowsSyncGroupCommand(session.page, command, args) }
    });
    automaticResult = await waitForAutomaticSync(session, beforeAutomatic?.run_id);
    report(options.reportProgress, 'automatic-converged');
    await waitForJourneyOrigins(session.page, ['A', 'C']);
    await waitForJourneyOriginCount(session.page, 'A', 2);
    const conflictNodeId = await conflictSeed(session.page);
    await invokeWindowsSyncGroupCommand(session.page, 'pause_companion_sync');
    await forkDesktopSyncConflict({ label: 'windows', nodeId: conflictNodeId,
      session: { invoke: (command, args) => invokeWindowsSyncGroupCommand(
        session.page, command, args
      ) } });
    report(options.reportProgress, 'conflict-fork-ready');
    await waitForWindowsSyncGroupProviderRelease({
      action: 'single-principal-sync-group', repoRoot: options.paths.repoRoot
    });
    await invokeWindowsSyncGroupCommand(session.page, 'resume_companion_sync');
    manualBeforeRestart = await invokeWindowsSyncGroupCommand(session.page, 'sync_companion_now');
    const conflicts = await waitForDesktopProductState(session.page, {
      command: 'load_sync_node_conflicts', commandArgs: { objectIds: [conflictNodeId] },
      condition: { count: 1, kind: 'sync-conflict-count' },
      eventName: 'onWorkspaceSyncApplied', timeoutMs: 2 * 60_000
    });
    conflictProof = { conflictCount: conflicts.length, nodeId: conflictNodeId,
      silentOverwrite: false, visible: true };
  } finally { await closeWindowsSyncGroupSession(session); }
  session = await openWindowsSyncGroupSession(options.paths, options.evidenceRoot);
  let restartedGroup;
  let manualAfterRestart;
  try {
    restartedGroup = assertJoinedWindowsGroup(await invokeWindowsSyncGroupCommand(
      session.page, 'load_sync_group_overview'
    ), candidate.group_id);
    const beforeRepeat = await waitForJourneyOrigins(session.page, ['A', 'C']);
    const restartedAutomatic = await waitForAutomaticSync(session, automaticResult?.run_id);
    manualAfterRestart = await invokeWindowsSyncGroupCommand(session.page, 'sync_companion_now');
    const afterRepeat = await waitForJourneyOrigins(session.page, ['A', 'C']);
    if (Object.keys(afterRepeat.nodesById).length !== Object.keys(beforeRepeat.nodesById).length) {
      throw new Error('Repeated Windows sync was not idempotent.');
    }
    report(options.reportProgress, 'restarted');
    automaticResult = { afterRestart: restartedAutomatic, beforeRestart: automaticResult };
  } finally { await closeWindowsSyncGroupSession(session); }
  const manifestPath = path.join(options.evidenceRoot,
    'single-principal-sync-group-receipt.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify({ buildIdentity: options.buildIdentity,
    completedAt: new Date().toISOString(), deviceCount: restartedGroup.devices.length,
    groupId: restartedGroup.group_id, groupTag: restartedGroup.group_tag,
    localDeviceIdentityKey: restartedGroup.local_device_identity_key,
    libraryLocator: client.libraryHome, freshWorkspace: true,
    localDevicePersisted: firstGroup.local_device_identity_key
      === restartedGroup.local_device_identity_key,
    automaticFactId: automaticFact.factId,
    automaticRunIds: { afterRestart: automaticResult.afterRestart.run_id,
      beforeRestart: automaticResult.beforeRestart.run_id },
    runs: { automaticAfterRestart: automaticResult.afterRestart,
      automaticBeforeRestart: automaticResult.beforeRestart, initial: initialResult,
      manualAfterRestart, manualBeforeRestart },
    idempotent: true, journeyFactId: localFact.factId, journeyOrigins: ['A', 'C'],
    conflict: conflictProof,
    resultStatus: 'success', schemaVersion: 2
  }, null, 2)}\n`, 'utf8');
  return { output: '', singlePrincipalSyncGroup: { manifestPath } };
}
