export interface PairedSyncGroupPeer {
  endpoint_url: string;
  group_id: string;
  local_device_id: string;
  peer_device_id: string;
  peer_device_kind: string;
  peer_device_name: string;
  secret: string;
  timeline_id: string;
}

export function isClientPeerRecord(value: unknown): value is PairedSyncGroupPeer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return ['endpoint_url', 'group_id', 'local_device_id', 'peer_device_id', 'peer_device_kind',
    'peer_device_name', 'secret', 'timeline_id'].every((key) => typeof record[key] === 'string');
}

export function isPairedDeviceRecord(value: unknown): value is PairedCompanionDevice {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (record.client_address === null || typeof record.client_address === 'string' ||
      typeof record.client_address === 'undefined') &&
    ['device_id', 'device_kind', 'device_name', 'device_secret', 'paired_at']
      .every((key) => typeof record[key] === 'string');
}
import type { SyncProtocolDescriptor } from '../../lib/platform/syncProtocolContract.js';

export interface PairedCompanionDevice {
  client_address: string | null;
  device_id: string;
  device_kind: string;
  device_name: string;
  device_secret: string;
  negotiated_protocol_version?: number;
  paired_at: string;
  remote_protocol?: SyncProtocolDescriptor;
}
