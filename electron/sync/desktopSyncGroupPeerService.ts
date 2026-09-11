type SyncGroupIdentity = {
  group_id: string;
  local_device_identity_key: string;
};

type SyncGroupService = {
  txt?: Record<string, unknown>;
};

export function readSyncGroupServiceDeviceId(service: SyncGroupService) {
  const value = service.txt?.device_id ?? service.txt?.provider_device_id;
  return typeof value === 'string' && value.trim() ? value : null;
}

export function isCurrentGroupPeerService(
  service: SyncGroupService,
  group: SyncGroupIdentity | null
) {
  const deviceId = readSyncGroupServiceDeviceId(service);
  return Boolean(group
    && deviceId
    && service.txt?.group_id === group.group_id
    && deviceId !== group.local_device_identity_key);
}
