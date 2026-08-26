export interface SyncGroupJoinRequestSurfaceItem {
  device_name: string;
  platform: string;
  request_id: string;
}

export const SYNC_GROUP_JOIN_COPY = {
  accept: 'Accept',
  error: 'The join request could not be updated.',
  reject: 'Reject',
  title: 'Join request'
} as const;

export function syncGroupJoinRequestDescription(deviceName: string) {
  return `${deviceName} wants to join this Sync Group.`;
}
