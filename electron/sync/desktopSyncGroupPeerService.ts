type SyncGroupIdentity = {
  group_id: string;
  local_device_identity_key: string;
};

type SyncGroupService = {
  txt?: Record<string, unknown>;
};

export function isCurrentGroupPeerService(
  service: SyncGroupService,
  group: SyncGroupIdentity | null
) {
  return Boolean(group
    && service.txt?.group_id === group.group_id
    && service.txt.device_id !== group.local_device_identity_key);
}
