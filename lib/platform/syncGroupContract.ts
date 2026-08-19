export type SyncGroupMemberState = 'active' | 'left';

export interface SyncGroupMemberPayload {
  approved_by_host_name: string;
  authorization_id: string;
  host_name: string;
  host_platform: string;
  joined_at: string;
  state: SyncGroupMemberState;
}

export interface SyncGroupPayload {
  created_at: string;
  created_by_host_name: string;
  display_name: string;
  group_id: string;
  local_host_name: string;
  local_member_state: SyncGroupMemberState;
  members: SyncGroupMemberPayload[];
  timeline_id: string;
}

export interface SyncGroupDiscoveryPayload {
  app_version: string;
  group_display_name: string;
  group_id: string;
  protocol: import('./syncProtocolContract.js').SyncProtocolDescriptor;
  provider_host_name: string;
  provider_host_platform: string;
  timeline_id: string;
}

export interface SyncGroupLibraryFacts {
  attachment_count: number;
  content_blob_count: number;
  node_count: number;
  review_log_count: number;
  timeline_id: string | null;
}

export function resolveSyncGroupDisplayHostName(group: SyncGroupPayload) {
  return group.members.find((member) => member.host_name === group.created_by_host_name)?.host_name
    ?? group.display_name;
}
