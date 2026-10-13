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
const inFlight = new Map<string, Promise<boolean>>();

export function startDesktopSyncGroupAutoSync() {
  if (!isDesktopCompanionSyncParticipating() || runtime) return;
  const group = loadDesktopSyncGroup();
  if (!group) return;
  resetDesktopSyncGroupRecovery();
  clearDesktopSyncGroupDiscoveryErrors();
  stopReadwiseContinuation = subscribeDesktopSyncCompleted(resumeReadwiseHandoff);
  runtime = startDesktopSyncGroupMemberStateSession(group, () => {
    notifyDesktopSyncGroupOverviewChanged();
    resumeReadwiseHandoff();
  }, activatePeer, deviceId => {
    removeDesktopSyncGroupRoute(deviceId);
    refreshEligibility(group.group_id);
  }, error => setDesktopSyncGroupDiscoveryError('member', error));
}

export function stopDesktopSyncGroupAutoSync() {
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
  if (!isDesktopCompanionSyncParticipating()) return;
  scheduleDesktopSyncGroupRecovery(() => {
    if (!isDesktopCompanionSyncParticipating()) return;
    runtime?.recover();
    recoverCompanionMdnsAdvertisement();
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
  await loadActiveDesktopSyncRun()?.catch(() => undefined);
  await Promise.allSettled([...inFlight.values()]);
  const state = await runWithDatabaseConnectionOwner(() => ({
    group: loadDesktopSyncGroup(), participating: isDesktopCompanionSyncParticipating(),
    pending: loadUnreconciledWatchedFolderConflictDecisions().length > 0
  }));
  if (!state.group || !state.participating || !state.pending) return;
  for (const peer of loadDesktopSyncGroupMemberEndpoints(state.group.group_id)) saveDesktopSyncGroupRoute(peer);
  if (loadDesktopSyncGroupRoutes(state.group.group_id).length) await runDesktopSyncCoordinator('automatic');
}

function activatePeer(peer: DesktopSyncGroupPeer) {
  const existing = inFlight.get(peer.peer_device_id);
  if (existing) return existing;
  saveDesktopSyncGroupRoute(peer);
  refreshEligibility(peer.group_id);
  const work = runDesktopSyncCoordinator('automatic', peer).then(result => result.status === 'completed').catch(error => {
    console.info('[sync-group] peer sync remains pending', { peerDeviceId: peer.peer_device_id,
      error: error instanceof Error ? error.message : String(error) });
    return false;
  }).finally(() => inFlight.delete(peer.peer_device_id));
  inFlight.set(peer.peer_device_id, work);
  return work;
}

async function runDesktopManualSync() {
  const group = await runWithDatabaseConnectionOwner(() => loadDesktopSyncGroup());
  if (!group) return runDesktopSyncCoordinator('manual');
  await exchangeAllDesktopSyncGroupMemberStates();
  for (const peer of loadDesktopSyncGroupMemberEndpoints(group.group_id)) saveDesktopSyncGroupRoute(peer);
  if (!loadDesktopSyncGroupRoutes(group.group_id).length) {
    const candidates = await discoverDesktopSyncGroups(fetch, true);
    for (const candidate of candidates) {
      if (candidate.provider_device_id === group.local_device_identity_key) continue;
      const route = await runWithDatabaseConnectionOwner(() => routeFromCandidate(group, candidate));
      if (route) saveDesktopSyncGroupRoute(route);
    }
  }
  if (!loadDesktopSyncGroupRoutes(group.group_id).length) {
    await recordDesktopSyncNoPeer('manual');
    return null;
  }
  refreshEligibility(group.group_id);
  return runDesktopSyncCoordinator('manual');
}

function refreshEligibility(groupId: string) {
  updateDesktopSyncFreshness(isDesktopCompanionSyncParticipating() && loadDesktopSyncGroupRoutes(groupId).length > 0);
  notifyDesktopSyncGroupOverviewChanged();
}
