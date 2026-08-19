import type { SyncProtocolDescriptor } from '../../lib/platform/syncProtocolContract.js';

export interface PairedSyncGroupPeer {
  endpoint_url: string;
  group_id: string;
  local_authorization_id: string;
  local_device_id: string;
  local_host_name: string;
  peer_authorization_id: string;
  peer_device_id: string;
  peer_device_kind: string;
  peer_device_name: string;
  peer_host_name: string;
  peer_host_platform: string;
  timeline_id: string;
}

export interface PairedCompanionAuthorization {
  authorization_id: string;
  client_address: string | null;
  credential_secret: string;
  device_id: string;
  device_kind: string;
  device_name: string;
  host_name: string;
  host_platform: string;
  negotiated_protocol_version?: number;
  paired_at: string;
  remote_protocol?: SyncProtocolDescriptor;
}

export function isClientPeerRecord(value: unknown): value is PairedSyncGroupPeer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return ['endpoint_url', 'group_id', 'local_authorization_id', 'local_device_id', 'local_host_name',
    'peer_authorization_id', 'peer_device_id', 'peer_device_kind', 'peer_device_name',
    'peer_host_name', 'peer_host_platform', 'timeline_id']
    .every((key) => typeof record[key] === 'string' && Boolean((record[key] as string).trim()));
}

export function isPairedAuthorizationRecord(value: unknown): value is PairedCompanionAuthorization {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (record.client_address === null || typeof record.client_address === 'string' ||
      typeof record.client_address === 'undefined') &&
    ['authorization_id', 'credential_secret', 'device_id', 'device_kind', 'device_name',
      'host_name', 'host_platform', 'paired_at']
      .every((key) => typeof record[key] === 'string' && Boolean((record[key] as string).trim()));
}
