import { isDesktopSyncGroupPlatform } from '../../lib/platform/syncGroupPlatform.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { isDesktopSyncGroupDeviceBlocked } from '../database/syncGroupMemberStateStore.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { updateCompanionMdnsAdvertisementRole } from './companionMdnsAdvertisement.js';
import { loadDesktopAnchorTopologyState } from './desktopAnchorTopologyRole.js';
import {
  startDesktopAnchorTopologySession,
  type DesktopAnchorTarget
} from './desktopAnchorTopologySession.js';
import { isDesktopCompanionSyncParticipating } from './desktopCompanionSyncPreference.js';
import type { DesktopDnsSdSession } from './desktopDnsSd.js';
import { updateDesktopSyncFreshness } from './desktopMemberSyncCadence.js';
import { runDesktopSyncCoordinator, subscribeDesktopSyncCompleted } from './desktopSyncCoordinator.js';
import { discoverDesktopSyncGroups } from './desktopSyncGroupDiscovery.js';
import {
  exchangeAllDesktopSyncGroupMemberStates,
  loadDesktopSyncGroupMemberEndpoints,
  startDesktopSyncGroupMemberStateSession
} from './desktopSyncGroupMemberStateSession.js';
import { notifyDesktopSyncGroupOverviewChanged } from './desktopSyncGroupOverviewNotifier.js';
import {
  clearDesktopSyncGroupRoutes,
  loadDesktopSyncGroupRoutes,
  removeDesktopSyncGroupRoute,
  restoreDesktopSyncGroupMobileGuideRoute,
  saveDesktopSyncGroupRoute,
  type DesktopSyncGroupPeer
} from './desktopSyncGroupRoutes.js';
import { continuePendingReadwiseHandoff } from './readwiseOwnerHandoff.js';

let runtime: DesktopDnsSdSession | null = null;
let memberStateRuntime: DesktopDnsSdSession | null = null;
let stopReadwiseContinuation: (() => void) | null = null;
let manualRun: Promise<unknown> | null = null;
const inFlight = new Map<string, Promise<boolean>>();

export function startDesktopSyncGroupAutoSync() {
  if (!isDesktopCompanionSyncParticipating() || runtime) return;
  const group = loadDesktopSyncGroup();
  if (!group) return;
  stopReadwiseContinuation = subscribeDesktopSyncCompleted(resumeReadwiseHandoff);
  runtime = startDesktopAnchorTopologySession({
    group,
    onAnchor: (target, requireSyncBeforeDemote) => (
      activateAnchorRoute(group, target, requireSyncBeforeDemote)
    ),
    onAnchorLost: (deviceId) => {
      removeDesktopSyncGroupRoute(deviceId);
      updateDesktopSyncFreshness(false);
    },
    onState: (state) => {
      void updateCompanionMdnsAdvertisementRole(state.role).catch((error) => {
        console.warn('[sync-group] failed to publish desktop topology role', error);
      });
      updateFreshnessForRole(group.group_id);
      notifyDesktopSyncGroupOverviewChanged();
    }
  });
  memberStateRuntime = startDesktopSyncGroupMemberStateSession(
    group,
    () => { notifyDesktopSyncGroupOverviewChanged(); resumeReadwiseHandoff(); },
    (peer) => activateMemberRoute(group, peer),
    (deviceId) => {
      removeDesktopSyncGroupRoute(deviceId);
      updateFreshnessForRole(group.group_id);
    }
  );
  const mobileGuide = restoreDesktopSyncGroupMobileGuideRoute(group.group_id);
  if (mobileGuide) resumeMobileGuideRoute(mobileGuide);
}

export function stopDesktopSyncGroupAutoSync() {
  stopReadwiseContinuation?.();
  stopReadwiseContinuation = null;
  runtime?.stop();
  runtime = null;
  memberStateRuntime?.stop();
  memberStateRuntime = null;
  clearDesktopSyncGroupRoutes();
  updateDesktopSyncFreshness(false);
}

function resumeReadwiseHandoff() {
  void continuePendingReadwiseHandoff().then((result) => {
    if (result?.is_active) notifyDesktopSyncGroupOverviewChanged();
  }).catch((error) => console.info('[readwise] handoff remains pending', error));
}

export function runDesktopManualSyncWithDiscovery() {
  if (manualRun) return manualRun;
  manualRun = runDesktopManualSync().finally(() => { manualRun = null; });
  return manualRun;
}

function resumeMobileGuideRoute(route: DesktopSyncGroupPeer) {
  if (inFlight.has(route.peer_device_id)) return;
  updateDesktopSyncFreshness(true);
  const work = runDesktopSyncCoordinator('automatic', route)
    .then(() => {
      removeDesktopSyncGroupRoute(route.peer_device_id);
      return true;
    })
    .catch((error) => {
      console.info('[sync-group] mobile guide sync paused until it is available', {
        error: error instanceof Error ? error.message : String(error),
        peerDeviceId: route.peer_device_id
      });
      return false;
    })
    .finally(() => inFlight.delete(route.peer_device_id));
  inFlight.set(route.peer_device_id, work);
}

async function runDesktopManualSync() {
  const group = await runWithDatabaseConnectionOwner(() => loadDesktopSyncGroup());
  if (!group) return runDesktopSyncCoordinator('manual');
  await exchangeAllDesktopSyncGroupMemberStates();
  if (loadDesktopAnchorTopologyState().role === 'anchor') {
    const memberRoutes = loadDesktopSyncGroupRoutes(group.group_id)
      .filter((route) => route.route_kind === 'member');
    for (const peer of loadDesktopSyncGroupMemberEndpoints(group.group_id)) {
      if (peer.route_kind !== 'member' || !isDesktopSyncGroupPlatform(peer.peer_platform)) continue;
      if (memberRoutes.some((route) => route.peer_device_id === peer.peer_device_id)) continue;
      memberRoutes.push(saveDesktopSyncGroupRoute(peer));
    }
    return memberRoutes.length ? runDesktopSyncCoordinator('manual') : null;
  }
  const current = loadDesktopSyncGroupRoutes(group.group_id)[0];
  if (current) return runDesktopSyncCoordinator('manual', current);
  const candidates = await discoverDesktopSyncGroups();
  const candidate = candidates.find((value) => value.group_id === group.group_id
    && value.provider_device_id !== group.local_device_identity_key
    && !['android-capacitor', 'ios-capacitor'].includes(value.provider_platform.toLowerCase()));
  if (!candidate) return runDesktopSyncCoordinator('manual');
  const route = await runWithDatabaseConnectionOwner(() => routeFromCandidate(group, candidate));
  if (!route) return runDesktopSyncCoordinator('manual');
  saveDesktopSyncGroupRoute(route);
  try {
    return await runDesktopSyncCoordinator('manual', route);
  } finally {
    removeDesktopSyncGroupRoute(route.peer_device_id);
  }
}

async function activateAnchorRoute(
  group: NonNullable<ReturnType<typeof loadDesktopSyncGroup>>,
  target: DesktopAnchorTarget,
  requireSyncBeforeDemote = false
) {
  if (loadDesktopAnchorTopologyState().role === 'anchor' && !requireSyncBeforeDemote) {
    return Promise.resolve(false);
  }
  const route = await runWithDatabaseConnectionOwner(() => routeFromTarget(group, target));
  if (!route) return false;
  saveDesktopSyncGroupRoute(route);
  updateDesktopSyncFreshness(true);
  const active = inFlight.get(target.peerDeviceId);
  if (active) return active;
  const work = runDesktopSyncCoordinator('automatic', route)
    .then(() => true)
    .catch((error) => {
      console.info('[sync-group] anchor sync paused until it is available', {
        error: error instanceof Error ? error.message : String(error),
        peerDeviceId: target.peerDeviceId
      });
      return false;
    })
    .finally(() => inFlight.delete(target.peerDeviceId));
  inFlight.set(target.peerDeviceId, work);
  return work;
}

function activateMemberRoute(
  group: NonNullable<ReturnType<typeof loadDesktopSyncGroup>>,
  peer: DesktopSyncGroupPeer
) {
  if (loadDesktopAnchorTopologyState().role !== 'anchor'
      || !isDesktopSyncGroupPlatform(peer.peer_platform)) return Promise.resolve(false);
  const route = { ...peer, route_kind: 'member' as const };
  saveDesktopSyncGroupRoute(route);
  updateDesktopSyncFreshness(true);
  const active = inFlight.get(route.peer_device_id);
  if (active) return active;
  const work = runDesktopSyncCoordinator('automatic', route)
    .then(() => true)
    .catch((error) => {
      console.info('[sync-group] member collection paused until it is available', {
        error: error instanceof Error ? error.message : String(error),
        peerDeviceId: route.peer_device_id
      });
      return false;
    })
    .finally(() => inFlight.delete(route.peer_device_id));
  inFlight.set(route.peer_device_id, work);
  return work;
}

function updateFreshnessForRole(groupId: string) {
  const role = loadDesktopAnchorTopologyState().role;
  const routes = loadDesktopSyncGroupRoutes(groupId);
  updateDesktopSyncFreshness(routes.some((route) =>
    role === 'member' ? route.route_kind === 'anchor' : role === 'anchor' && route.route_kind === 'member'
  ));
}

function routeFromTarget(
  group: NonNullable<ReturnType<typeof loadDesktopSyncGroup>>,
  target: DesktopAnchorTarget
) {
  return routeFromCandidate(group, {
    endpoint_url: target.endpointUrl,
    group_id: target.groupId,
    provider_device_id: target.peerDeviceId
  });
}

function routeFromCandidate(
  group: NonNullable<ReturnType<typeof loadDesktopSyncGroup>>,
  candidate: {
    endpoint_url: string;
    group_id: string;
    provider_device_id: string;
    provider_device_name?: string;
    provider_platform?: string;
  }
): DesktopSyncGroupPeer | null {
  const remote = group.devices.find((device) =>
    device.device_identity_key === candidate.provider_device_id && device.state === 'active');
  if (candidate.group_id !== group.group_id ||
      isDesktopSyncGroupDeviceBlocked(group.group_id, candidate.provider_device_id)) return null;
  return {
    endpoint_url: candidate.endpoint_url,
    group_id: group.group_id,
    local_device_id: group.local_device_identity_key,
    peer_device_id: candidate.provider_device_id,
    peer_device_name: remote?.device_name ?? candidate.provider_device_name ?? candidate.provider_device_id,
    peer_platform: remote?.platform ?? candidate.provider_platform ?? 'desktop',
    route_kind: 'anchor'
  };
}
