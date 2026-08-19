import type { SyncProtocolDescriptor } from '../../lib/platform/syncProtocolContract.js';

import type {
  PairedCompanionAuthorization,
  PairedSyncGroupPeer
} from './companionPairingStoreRecords.js';

interface LegacyDevice {
  client_address?: string | null;
  device_id: string;
  device_kind: string;
  device_name: string;
  device_secret: string;
  negotiated_protocol_version?: number;
  paired_at: string;
  remote_protocol?: SyncProtocolDescriptor;
}

interface LegacyPeer {
  endpoint_url: string;
  group_id: string;
  local_device_id: string;
  local_host_name?: string;
  peer_device_id: string;
  peer_device_kind: string;
  peer_device_name: string;
  peer_host_name?: string;
  peer_host_platform?: string;
  timeline_id: string;
}

export function createMigratedPairingStorePayload(
  raw: Record<string, unknown>,
  resolveAuthorization: (hostName: string) => string | null
): { authorizations: PairedCompanionAuthorization[]; client_peers: PairedSyncGroupPeer[]; format_version: 2 } {
  const devices = Array.isArray(raw.devices) ? raw.devices as LegacyDevice[] : [];
  const peers = Array.isArray(raw.client_peers) ? raw.client_peers as LegacyPeer[] : [];
  return {
    authorizations: devices.map((device) => ({
      authorization_id: resolveAuthorization(device.device_name) ?? device.device_id,
      client_address: device.client_address ?? null,
      credential_secret: device.device_secret,
      device_id: device.device_id,
      device_kind: device.device_kind,
      device_name: device.device_name,
      host_name: device.device_name,
      host_platform: device.device_kind,
      ...(device.negotiated_protocol_version ? { negotiated_protocol_version: device.negotiated_protocol_version } : {}),
      paired_at: device.paired_at,
      ...(device.remote_protocol ? { remote_protocol: device.remote_protocol } : {})
    })),
    client_peers: peers.map((peer) => {
      const localHost = peer.local_host_name?.trim() || peer.local_device_id;
      const peerHost = peer.peer_host_name?.trim() || peer.peer_device_name;
      return {
        endpoint_url: peer.endpoint_url, group_id: peer.group_id,
        local_authorization_id: resolveAuthorization(localHost) ?? peer.local_device_id,
        local_device_id: peer.local_device_id, local_host_name: localHost,
        peer_authorization_id: resolveAuthorization(peerHost) ?? peer.peer_device_id,
        peer_device_id: peer.peer_device_id, peer_device_kind: peer.peer_device_kind,
        peer_device_name: peer.peer_device_name, peer_host_name: peerHost,
        peer_host_platform: peer.peer_host_platform?.trim() || peer.peer_device_kind,
        timeline_id: peer.timeline_id
      };
    }),
    format_version: 2
  };
}
