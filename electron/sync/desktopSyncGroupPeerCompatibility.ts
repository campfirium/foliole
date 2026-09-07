import { evaluateSyncProtocolCompatibility } from '../../lib/platform/syncProtocolContract.js';

import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';

const DESCRIPTOR_TIMEOUT_MS = 2_000;

export async function assertDesktopSyncGroupPeerCompatible(
  peer: DesktopSyncGroupPeer,
  fetchDiscovery: typeof fetch = fetch
) {
  const response = await fetchDiscovery(`${peer.endpoint_url}/companion/discovery`, {
    signal: AbortSignal.timeout(DESCRIPTOR_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`sync_group_discovery_http_${response.status}`);
  const discovery = await response.json() as Record<string, unknown>;
  if (discovery.group_id !== peer.group_id || discovery.provider_device_id !== peer.peer_device_id) {
    throw new Error('sync_group_peer_identity_mismatch');
  }
  const compatibility = evaluateSyncProtocolCompatibility(discovery.protocol);
  if (compatibility.status !== 'compatible') {
    throw new Error(`sync_group_peer_incompatible:${compatibility.reason ?? 'unknown'}`);
  }
}
