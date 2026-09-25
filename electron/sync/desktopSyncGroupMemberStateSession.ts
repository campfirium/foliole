import { parseDesktopAnchorRole } from '../../lib/platform/syncAnchorTopologyContract.js';
import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract.js';
import { evaluateSyncProtocolCompatibility } from '../../lib/platform/syncProtocolContract.js';
import { loadDesktopSyncGroupMemberState } from '../database/syncGroupMemberStateStore.js';

import { resolveCompanionMdnsServiceEndpoints } from './companionMdnsServiceEndpoints.js';
import { startDesktopDnsSdSession, type DesktopDnsSdSession } from './desktopDnsSd.js';
import {
  exchangeDesktopSyncGroupMemberState,
  publishDesktopSyncGroupMemberState
} from './desktopSyncGroupMemberState.js';
import { isCurrentGroupPeerService, readSyncGroupServiceDeviceId } from './desktopSyncGroupPeerService.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';

const endpoints = new Map<string, DesktopSyncGroupPeer>();
const activatedMembers = new Map<string, string>();
const inFlight = new Map<string, Promise<void>>();

export function startDesktopSyncGroupMemberStateSession(
  group: SyncGroupPayload,
  onChanged: () => void,
  onMember: (peer: DesktopSyncGroupPeer) => Promise<boolean> = async () => false,
  onMemberLost: (deviceId: string) => void = () => undefined
): DesktopDnsSdSession {
  const runtime = startDesktopDnsSdSession({
    onError: () => undefined,
    onService: ({ kind, service }) => {
      if (!isCurrentGroupPeerService(service, group)) return;
      const deviceId = readSyncGroupServiceDeviceId(service);
      if (!deviceId) return;
      if (kind === 'lost') {
        endpoints.delete(deviceId);
        activatedMembers.delete(deviceId);
        onMemberLost(deviceId);
        return;
      }
      const endpointUrl = resolveCompanionMdnsServiceEndpoints(service)[0];
      if (!endpointUrl) return;
      void probeAndExchange(group, deviceId, endpointUrl, onChanged, onMember);
    }
  });
  return {
    stop: () => {
      runtime.stop();
      endpoints.clear();
      activatedMembers.clear();
      inFlight.clear();
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

export async function publishDesktopSyncGroupDeparture(groupId: string, senderDeviceId: string) {
  const state = loadDesktopSyncGroupMemberState({ groupId, senderDeviceId });
  const peers = [...endpoints.values()].filter((peer) => peer.group_id === groupId);
  const results = await Promise.allSettled(peers.map((peer) =>
    publishDesktopSyncGroupMemberState(peer, state)));
  return results.some((result) => result.status === 'fulfilled');
}

async function probeAndExchange(
  group: SyncGroupPayload,
  deviceId: string,
  endpointUrl: string,
  onChanged: () => void,
  onMember: (peer: DesktopSyncGroupPeer) => Promise<boolean>
) {
  if (inFlight.has(deviceId)) return inFlight.get(deviceId);
  const work = probe(group, deviceId, endpointUrl)
    .then(async (qualified) => {
      if (!qualified) return;
      const { peer, role } = qualified;
      endpoints.set(deviceId, peer);
      await exchangeDesktopSyncGroupMemberState(peer);
      onChanged();
      if (role === 'member' && activatedMembers.get(deviceId) !== peer.endpoint_url
          && await onMember(peer)) activatedMembers.set(deviceId, peer.endpoint_url);
    })
    .catch((error) => console.info('[sync-group] member state exchange paused', {
      error: error instanceof Error ? error.message : String(error), peerDeviceId: deviceId
    }))
    .finally(() => inFlight.delete(deviceId));
  inFlight.set(deviceId, work);
  return work;
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
