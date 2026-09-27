import { parseDesktopAnchorRole } from '../../lib/platform/syncAnchorTopologyContract.js';
import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract.js';
import { evaluateSyncProtocolCompatibility } from '../../lib/platform/syncProtocolContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadDesktopSyncGroupMemberState } from '../database/syncGroupMemberStateStore.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { resolveCompanionMdnsServiceEndpoints } from './companionMdnsServiceEndpoints.js';
import {
  startRecoverableDesktopDnsSdSession, type RecoverableDesktopDnsSdSession
} from './desktopDnsSdRecoverySession.js';
import { createDesktopSyncGroupMemberDiscovery, type MemberObservation } from './desktopSyncGroupMemberDiscovery.js';
import {
  exchangeDesktopSyncGroupMemberState,
  publishDesktopSyncGroupMemberState
} from './desktopSyncGroupMemberState.js';
import { isCurrentGroupPeerService, readSyncGroupServiceDeviceId } from './desktopSyncGroupPeerService.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';
import { loadDesktopSyncGroupRoutes } from './desktopSyncGroupRoutes.js';

const endpoints = new Map<string, DesktopSyncGroupPeer>();

export function startDesktopSyncGroupMemberStateSession(
  group: SyncGroupPayload,
  onChanged: () => void,
  onMember: (peer: DesktopSyncGroupPeer) => Promise<boolean> = async () => false,
  onMemberLost: (deviceId: string) => void = () => undefined,
  onDiscoveryState: (error: Error | null) => void = () => undefined
): RecoverableDesktopDnsSdSession {
  let active = true;
  const activatedMembers = new Map<string, string>();
  const discovery = createDesktopSyncGroupMemberDiscovery(
    (observation, isCurrent) => probeAndExchange(group, observation,
      activatedMembers, onChanged, onMember, isCurrent),
    (deviceId) => {
      endpoints.delete(deviceId);
      activatedMembers.delete(deviceId);
      onMemberLost(deviceId);
    }
  );
  const runtime = startRecoverableDesktopDnsSdSession({
    onError: (error) => { discovery.reset(); onDiscoveryState(error); },
    onStarted: () => {
      discovery.reset();
      onDiscoveryState(null);
    },
    onService: ({ kind, service }) => {
      if (!active) return;
      if (!isCurrentGroupPeerService(service, group)) return;
      const deviceId = readSyncGroupServiceDeviceId(service);
      if (!deviceId) return;
      if (kind === 'lost') return discovery.lost(deviceId, service);
      const endpointUrl = resolveCompanionMdnsServiceEndpoints(service)[0];
      if (!endpointUrl) return;
      discovery.found({ deviceId, endpointUrl, service });
    }
  });
  return {
    recover: () => runtime.recover(),
    stop: () => {
      active = false;
      discovery.reset();
      runtime.stop();
      endpoints.clear();
      activatedMembers.clear();
    }
  };
}

export function loadDesktopSyncGroupMemberEndpoints(groupId: string) {
  return [...endpoints.values()].filter((peer) => peer.group_id === groupId);
}

export async function exchangeDesktopSyncGroupMemberStateWithDevice(deviceId: string) {
  const peer = endpoints.get(deviceId);
  if (!peer) return false;
  await exchangeDesktopSyncGroupMemberState(peer);
  return true;
}

export async function exchangeAllDesktopSyncGroupMemberStates() {
  const results = await Promise.allSettled([...endpoints.values()].map((peer) =>
    exchangeDesktopSyncGroupMemberState(peer)));
  return results.some((result) => result.status === 'fulfilled');
}

export async function publishWatchedFolderGroupMemberState() {
  const group = await runWithDatabaseConnectionOwner(() => loadDesktopSyncGroup());
  if (!group) return;
  const peers = new Map<string, DesktopSyncGroupPeer>();
  for (const peer of [...endpoints.values(), ...loadDesktopSyncGroupRoutes(group.group_id)]) {
    if (peer.group_id === group.group_id) peers.set(peer.peer_device_id, peer);
  }
  await Promise.allSettled([...peers.values()].map(exchangeDesktopSyncGroupMemberState));
}

export async function publishDesktopSyncGroupDeparture(groupId: string, senderDeviceId: string) {
  const state = loadDesktopSyncGroupMemberState({ groupId, senderDeviceId });
  const peers = [...endpoints.values()].filter((peer) => peer.group_id === groupId);
  const results = await Promise.allSettled(peers.map((peer) =>
    publishDesktopSyncGroupMemberState(peer, state)));
  return results.some((result) => result.status === 'fulfilled');
}

async function probeAndExchange(
  group: SyncGroupPayload,
  observation: MemberObservation,
  activatedMembers: Map<string, string>,
  onChanged: () => void,
  onMember: (peer: DesktopSyncGroupPeer) => Promise<boolean>,
  isCurrent: () => boolean
) {
  const { deviceId, endpointUrl, service } = observation;
  try {
    const qualified = await probe(group, deviceId, endpointUrl);
    if (!qualified || !isCurrent()) return;
    const { peer, role } = qualified;
    endpoints.set(deviceId, peer);
    await exchangeDesktopSyncGroupMemberState(peer);
    if (!isCurrent()) return;
    onChanged();
    const activation = JSON.stringify([service.txt.runtime_instance_id, peer.endpoint_url]);
    if (role === 'member' && activatedMembers.get(deviceId) !== activation
        && await onMember(peer) && isCurrent()) activatedMembers.set(deviceId, activation);
  } catch (error) {
    console.info('[sync-group] member state exchange paused', {
      error: error instanceof Error ? error.message : String(error), peerDeviceId: deviceId
    });
  }
}

async function probe(group: SyncGroupPayload, deviceId: string, endpointUrl: string) {
  const response = await fetch(`${endpointUrl}/companion/discovery`, {
    signal: AbortSignal.timeout(2_000)
  });
  if (!response.ok) return null;
  const discovery = await response.json() as Record<string, unknown>;
  if (discovery.group_id !== group.group_id || discovery.provider_device_id !== deviceId ||
      evaluateSyncProtocolCompatibility(discovery.protocol).status !== 'compatible') return null;
  const role = parseDesktopAnchorRole(discovery.topology_role);
  return { peer: {
    endpoint_url: endpointUrl,
    group_id: group.group_id,
    local_device_id: group.local_device_identity_key,
    peer_device_id: deviceId,
    peer_device_name: text(discovery.provider_device_name) ?? deviceId,
    peer_platform: text(discovery.provider_platform) ?? 'desktop',
    ...(role === 'member' || role === 'anchor' ? { route_kind: role } : {})
  } satisfies DesktopSyncGroupPeer,
  role };
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
