import type { SyncGroupPayload } from '../../lib/platform/syncGroupContract.js';
import { evaluateSyncProtocolCompatibility } from '../../lib/platform/syncProtocolContract.js';

import { resolveCompanionMdnsServiceEndpoints } from './companionMdnsServiceEndpoints.js';
import { startDesktopDnsSdSession, type DesktopDnsSdSession } from './desktopDnsSd.js';
import { exchangeDesktopSyncGroupMemberState } from './desktopSyncGroupMemberState.js';
import { isCurrentGroupPeerService, readSyncGroupServiceDeviceId } from './desktopSyncGroupPeerService.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';

const endpoints = new Map<string, DesktopSyncGroupPeer>();
const inFlight = new Map<string, Promise<void>>();

export function startDesktopSyncGroupMemberStateSession(
  group: SyncGroupPayload,
  onChanged: () => void
): DesktopDnsSdSession {
  const runtime = startDesktopDnsSdSession({
    onError: () => undefined,
    onService: ({ kind, service }) => {
      if (!isCurrentGroupPeerService(service, group)) return;
      const deviceId = readSyncGroupServiceDeviceId(service);
      if (!deviceId) return;
      if (kind === 'lost') {
        endpoints.delete(deviceId);
        return;
      }
      const endpointUrl = resolveCompanionMdnsServiceEndpoints(service)[0];
      if (!endpointUrl) return;
      void probeAndExchange(group, deviceId, endpointUrl, onChanged);
    }
  });
  return {
    stop: () => {
      runtime.stop();
      endpoints.clear();
      inFlight.clear();
    }
  };
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

async function probeAndExchange(
  group: SyncGroupPayload,
  deviceId: string,
  endpointUrl: string,
  onChanged: () => void
) {
  if (inFlight.has(deviceId)) return inFlight.get(deviceId);
  const work = probe(group, deviceId, endpointUrl)
    .then(async (peer) => {
      if (!peer) return;
      endpoints.set(deviceId, peer);
      await exchangeDesktopSyncGroupMemberState(peer);
      onChanged();
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
  return {
    endpoint_url: endpointUrl,
    group_id: group.group_id,
    local_device_id: group.local_device_identity_key,
    peer_device_id: deviceId,
    peer_device_name: text(discovery.provider_device_name) ?? deviceId,
    peer_platform: text(discovery.provider_platform) ?? 'desktop'
  } satisfies DesktopSyncGroupPeer;
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
