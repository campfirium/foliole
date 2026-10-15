import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';
import { loadUnreconciledWatchedFolderConflictDecisions } from '../database/watchedFolderConflictDecisions.js';

import { recoverCompanionMdnsAdvertisement } from './companionMdnsAdvertisement.js';
import { isDesktopCompanionSyncParticipating } from './desktopCompanionSyncPreference.js';
import type { RecoverableDesktopDnsSdSession } from './desktopDnsSdRecoverySession.js';
import { updateDesktopSyncFreshness } from './desktopMemberSyncCadence.js';
import { recordDesktopSyncNoPeer } from './desktopSyncActivityStore.js';
import { loadActiveDesktopSyncRun, runDesktopSyncCoordinator, subscribeDesktopSyncCompleted } from './desktopSyncCoordinator.js';
import { discoverDesktopSyncGroups } from './desktopSyncGroupDiscovery.js';
import { clearDesktopSyncGroupDiscoveryErrors, setDesktopSyncGroupDiscoveryError } from './desktopSyncGroupDiscoveryStatus.js';
import { exchangeAllDesktopSyncGroupMemberStates, loadDesktopSyncGroupMemberEndpoints,
  startDesktopSyncGroupMemberStateSession } from './desktopSyncGroupMemberStateSession.js';
import { notifyDesktopSyncGroupOverviewChanged } from './desktopSyncGroupOverviewNotifier.js';
import { resetDesktopSyncGroupRecovery, scheduleDesktopSyncGroupRecovery } from './desktopSyncGroupRecoveryScheduler.js';
import { routeFromCandidate } from './desktopSyncGroupRouteCandidate.js';
import { clearDesktopSyncGroupRoutes, loadDesktopSyncGroupRoutes, removeDesktopSyncGroupRoute,
  saveDesktopSyncGroupRoute, type DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';
import { closeDesktopSyncPeerRounds } from './desktopSyncPeerRoundOwner.js';
import { continuePendingReadwiseHandoff } from './readwiseOwnerHandoff.js';

let runtime: RecoverableDesktopDnsSdSession | null = null;
let stopReadwiseContinuation: (() => void) | null = null;
let manualRun: Promise<unknown> | null = null;
let startRun: Promise<void> | null = null;
let generation = 0;
const inFlight = new Map<string, Promise<boolean>>();

export function startDesktopSyncGroupAutoSync() {
  if (startRun) return startRun;
  const current = generation;
  const work = runWithDatabaseConnectionOwner(() => {
    if (current !== generation || !isDesktopCompanionSyncParticipating() || runtime) return;
    const group = loadDesktopSyncGroup();
    if (!group) return;
    resetDesktopSyncGroupRecovery();
    clearDesktopSyncGroupDiscoveryErrors();
    stopReadwiseContinuation = subscribeDesktopSyncCompleted(resumeReadwiseHandoff);
    runtime = startDesktopSyncGroupMemberStateSession(group, () => {
      notifyDesktopSyncGroupOverviewChanged();
      resumeReadwiseHandoff();
    }, (peer, isCurrent) => activatePeer(peer, () => current === generation && isCurrent()), deviceId => {
      removeDesktopSyncGroupRoute(deviceId);
      inFlight.delete(deviceId);
      void refreshEligibility(group.group_id, () => current === generation).catch(reportActivationError);
    }, error => setDesktopSyncGroupDiscoveryError('member', error));
  }).finally(() => { if (startRun === work) startRun = null; });
  startRun = work;
  return work;
}

export function stopDesktopSyncGroupAutoSync() {
  generation += 1;
  startRun = null;
  inFlight.clear();
  resetDesktopSyncGroupRecovery();
  stopReadwiseContinuation?.();
  stopReadwiseContinuation = null;
  runtime?.stop();
  runtime = null;
  closeDesktopSyncPeerRounds();
  clearDesktopSyncGroupDiscoveryErrors();
  clearDesktopSyncGroupRoutes();
  updateDesktopSyncFreshness(false);
}

export function recoverDesktopSyncGroupDiscovery() {
  const current = generation;
  scheduleDesktopSyncGroupRecovery(() => {
    void runWithDatabaseConnectionOwner(() => {
      if (current !== generation || !isDesktopCompanionSyncParticipating()) return;
      runtime?.recover();
      recoverCompanionMdnsAdvertisement();
    }).catch(reportActivationError);
  });
}

function resumeReadwiseHandoff() {
  void continuePendingReadwiseHandoff().then(result => {
    if (result?.is_active) notifyDesktopSyncGroupOverviewChanged();
  }).catch(error => console.info('[readwise] handoff remains pending', error));
}

export function runDesktopManualSyncWithDiscovery() {
  if (manualRun) return manualRun;
  manualRun = runDesktopManualSync().finally(() => { manualRun = null; });
  return manualRun;
}

export async function resumeDesktopSyncAfterWatchedDecision() {
  const current = generation;
  await loadActiveDesktopSyncRun()?.catch(() => undefined);
  await Promise.allSettled([...inFlight.values()]);
  const state = await runWithDatabaseConnectionOwner(() => ({
    group: loadDesktopSyncGroup(), participating: isDesktopCompanionSyncParticipating(),
    pending: loadUnreconciledWatchedFolderConflictDecisions().length > 0
  }));
  if (current !== generation || !state.group || !state.participating || !state.pending) return;
  for (const peer of loadDesktopSyncGroupMemberEndpoints(state.group.group_id)) saveDesktopSyncGroupRoute(peer);
  if (loadDesktopSyncGroupRoutes(state.group.group_id).length) await runDesktopSyncCoordinator('automatic');
}

function activatePeer(peer: DesktopSyncGroupPeer, isCurrent: () => boolean) {
  const existing = inFlight.get(peer.peer_device_id);
  if (existing) return existing;
  const work = runWithDatabaseConnectionOwner(() => {
    if (!isCurrent() || loadDesktopSyncGroup()?.group_id !== peer.group_id ||
        !isDesktopCompanionSyncParticipating()) return false;
    saveDesktopSyncGroupRoute(peer);
    return updateEligibility(peer.group_id);
  }).then(async eligible => {
    if (!eligible || !isCurrent()) return false;
    const result = await runDesktopSyncCoordinator('automatic', peer);
    return result.status === 'completed';
  }).catch(error => {
    if (isCurrent()) reportActivationError(error);
    return false;
  }).finally(() => {
    if (inFlight.get(peer.peer_device_id) === work) inFlight.delete(peer.peer_device_id);
  });
  inFlight.set(peer.peer_device_id, work);
  return work;
}

function reportActivationError(error: unknown) {
  setDesktopSyncGroupDiscoveryError('member', error instanceof Error ? error : new Error(String(error)));
}

async function runDesktopManualSync() {
  const current = generation;
  const group = await runWithDatabaseConnectionOwner(() => loadDesktopSyncGroup());
  if (current !== generation) return null;
  if (!group) return runDesktopSyncCoordinator('manual');
  await exchangeAllDesktopSyncGroupMemberStates();
  if (current !== generation) return null;
  for (const peer of loadDesktopSyncGroupMemberEndpoints(group.group_id)) saveDesktopSyncGroupRoute(peer);
  if (!loadDesktopSyncGroupRoutes(group.group_id).length) {
    const candidates = await discoverDesktopSyncGroups(fetch, true);
    for (const candidate of candidates) {
      if (candidate.provider_device_id === group.local_device_identity_key) continue;
      const route = await runWithDatabaseConnectionOwner(() => routeFromCandidate(group, candidate));
      if (current !== generation) return null;
      if (route) saveDesktopSyncGroupRoute(route);
    }
  }
  if (!loadDesktopSyncGroupRoutes(group.group_id).length) {
    await recordDesktopSyncNoPeer('manual');
    return null;
  }
  if (!await refreshEligibility(group.group_id, () => current === generation)) return null;
  return runDesktopSyncCoordinator('manual');
}

function refreshEligibility(groupId: string, isCurrent: () => boolean) {
  return runWithDatabaseConnectionOwner(() => isCurrent() && updateEligibility(groupId));
}

function updateEligibility(groupId: string) {
  const participating = loadDesktopSyncGroup()?.group_id === groupId && isDesktopCompanionSyncParticipating();
  updateDesktopSyncFreshness(participating && loadDesktopSyncGroupRoutes(groupId).length > 0);
  notifyDesktopSyncGroupOverviewChanged();
  return participating;
}
