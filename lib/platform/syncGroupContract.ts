export type SyncGroupMemberState = 'active' | 'left';

export interface SyncGroupMemberPayload {
  approved_by_device_id: string;
  authorization_id: string;
  device_id: string;
  device_kind: string;
  device_name: string;
  joined_at: string;
  state: SyncGroupMemberState;
}

export interface SyncGroupPayload {
  created_at: string;
  created_by_device_id: string;
  display_name: string;
  group_id: string;
  local_device_id: string;
  local_member_state: SyncGroupMemberState;
  members: SyncGroupMemberPayload[];
  timeline_id: string;
}

export interface SyncGroupDiscoveryPayload {
  app_version: string;
  group_display_name: string;
  group_id: string;
  protocol: import('./syncProtocolContract.js').SyncProtocolDescriptor;
  provider_device_id: string;
  provider_device_kind: string;
  provider_device_name: string;
  timeline_id: string;
}

export interface SyncGroupLibraryFacts {
  attachment_count: number;
  content_blob_count: number;
  node_count: number;
  review_log_count: number;
  timeline_id: string | null;
}

export function resolveSyncGroupDisplayDeviceName(group: SyncGroupPayload) {
  return group.members.find((member) => member.device_id === group.created_by_device_id)?.device_name
    ?? group.display_name;
}

export function isEmptySyncGroupLibrary(facts: SyncGroupLibraryFacts) {
  return facts.node_count === 0
    && facts.review_log_count === 0
    && facts.attachment_count === 0
    && facts.content_blob_count === 0
    && facts.timeline_id === null;
}
