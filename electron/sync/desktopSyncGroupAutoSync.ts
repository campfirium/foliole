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
import { runDesktopSyncCoordinator } from './desktopSyncCoordinator.js';
import { discoverDesktopSyncGroups } from './desktopSyncGroupDiscovery.js';
import {
  clearDesktopSyncGroupRoutes,
  loadDesktopSyncGroupRoutes,
  removeDesktopSyncGroupRoute,
  saveDesktopSyncGroupRoute,
  type DesktopSyncGroupPeer
} from './desktopSyncGroupRoutes.js';

let runtime: DesktopDnsSdSession | null = null;
let manualRun: Promise<unknown> | null = null;
const inFlight = new Map<string, Promise<boolean>>();

export function startDesktopSyncGroupAutoSync() {
  if (!isDesktopCompanionSyncParticipating() || runtime) return;
  const group = loadDesktopSyncGroup();
  if (!group) return;
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
      updateDesktopSyncFreshness(
        state.role === 'member' && loadDesktopSyncGroupRoutes(group.group_id).length > 0
      );
    }
  });
}

export function stopDesktopSyncGroupAutoSync() {
  runtime?.stop();
  runtime = null;
  clearDesktopSyncGroupRoutes();
  updateDesktopSyncFreshness(false);
}

export function runDesktopManualSyncWithDiscovery() {
  if (manualRun) return manualRun;
  manualRun = runDesktopManualSync().finally(() => { manualRun = null; });
  return manualRun;
}

async function runDesktopManualSync() {
  const group = loadDesktopSyncGroup();
  if (!group) return runDesktopSyncCoordinator('manual');
  if (loadDesktopAnchorTopologyState().role === 'anchor') return null;
  const current = loadDesktopSyncGroupRoutes(group.group_id)[0];
  if (current) return runDesktopSyncCoordinator('manual', current);
  const candidates = await discoverDesktopSyncGroups();
  const candidate = candidates.find((value) => value.group_id === group.group_id
    && value.provider_device_id !== group.local_device_identity_key
    && !['android-capacitor', 'ios-capacitor'].includes(value.provider_platform.toLowerCase()));
  if (!candidate) return runDesktopSyncCoordinator('manual');
  const route = routeFromCandidate(group, candidate);
  if (!route) return runDesktopSyncCoordinator('manual');
  saveDesktopSyncGroupRoute(route);
  try {
    return await runDesktopSyncCoordinator('manual', route);
  } finally {
    removeDesktopSyncGroupRoute(route.peer_device_id);
  }
}

function activateAnchorRoute(
  group: NonNullable<ReturnType<typeof loadDesktopSyncGroup>>,
  target: DesktopAnchorTarget,
  requireSyncBeforeDemote = false
) {
  if (loadDesktopAnchorTopologyState().role === 'anchor' && !requireSyncBeforeDemote) {
    return Promise.resolve(false);
  }
  const route = routeFromTarget(group, target);
  if (!route) return Promise.resolve(false);
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
  candidate: { endpoint_url: string; group_id: string; provider_device_id: string }
): DesktopSyncGroupPeer | null {
  const remote = group.devices.find((device) =>
    device.device_identity_key === candidate.provider_device_id && device.state === 'active');
  if (!remote || candidate.group_id !== group.group_id) return null;
  return {
    endpoint_url: candidate.endpoint_url,
    group_id: group.group_id,
    local_device_id: group.local_device_identity_key,
    peer_device_id: remote.device_identity_key,
    peer_device_name: remote.device_name,
    peer_platform: remote.platform,
    route_kind: 'anchor'
  };
}
