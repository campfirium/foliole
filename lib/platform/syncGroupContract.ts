export type SyncGroupDeviceState = 'active' | 'left';

export interface SyncGroupDevicePayload {
  canonical_library_path: string;
  contract_version: 1;
  device_anchor: string;
  device_identity_key: string;
  device_name: string;
  joined_at: string;
  last_seen_at: string | null;
  left_at: string | null;
  platform: string;
  state: SyncGroupDeviceState;
  updated_at: string;
}

export interface SyncGroupPayload {
  created_at: string;
  devices: SyncGroupDevicePayload[];
  display_name: string;
  group_id: string;
  group_tag?: string;
  local_device_identity_key: string;
}

export interface SyncGroupDiscoveryPayload {
  app_version: string;
  group_display_name: string;
  group_id: string;
  group_tag: string;
  protocol: import('./syncProtocolContract.js').SyncProtocolDescriptor;
  provider_device_id: string;
  provider_device_name: string;
  provider_platform: string;
}

export interface SyncGroupLibraryFacts {
  attachment_count: number;
  content_blob_count: number;
  node_count: number;
  review_log_count: number;
}

export function resolveSyncGroupDisplayDeviceName(group: SyncGroupPayload) {
  return group.display_name;
}

export function resolveLocalSyncGroupDevice(group: SyncGroupPayload) {
  return group.devices.find((device) =>
    device.device_identity_key === group.local_device_identity_key && device.state === 'active');
}

export function resolveRemoteSyncGroupDevices(group: SyncGroupPayload) {
  return group.devices.filter((device) =>
    device.device_identity_key !== group.local_device_identity_key && device.state === 'active');
}
