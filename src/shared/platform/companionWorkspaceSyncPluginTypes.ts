import type { SyncParticipationSnapshot } from '../../../lib/platform/syncParticipationContract';

import type { CompanionAttachmentResourceSyncPlugin } from './companionAttachmentResourceSyncPluginTypes';
import type { CompanionContentBlobSyncPlugin } from './companionContentBlobSyncPluginTypes';
import type { CompanionPairingSyncPlugin } from './companionPairingSyncPluginTypes';

interface CompanionDiscoveryCandidatesPayload {
  candidates: Array<{
    endpoint_url: string;
    protocol_txt?: Record<string, string>;
    source: 'direct' | 'nsd';
  }>;
}

export interface CompanionSyncGroupProviderState extends SyncParticipationSnapshot {
  pending_requests: Array<{
    device_id: string;
    device_kind: string;
    device_name: string;
    pair_request_id: string;
    requested_at: string;
  }>;
  port: number | null;
  state: 'running' | 'stopped';
}

export type CompanionSyncParticipationState = SyncParticipationSnapshot;

export interface CompanionWorkspaceSyncPlugin
  extends CompanionAttachmentResourceSyncPlugin, CompanionContentBlobSyncPlugin, CompanionPairingSyncPlugin {
  desktopHttpRequest(args: {
    body?: string;
    headers?: Record<string, string>;
    method: string;
    url: string;
  }): Promise<{ body: string; status: number }>;
  loadDiscoveryCandidates(): Promise<CompanionDiscoveryCandidatesPayload>;
  bindSyncGroupPeerRoute(args: {
    endpoint_url: string;
    local_authorization_id: string;
    local_device_id: string;
    local_host_name: string;
    peer_authorization_id: string;
    peer_device_id: string;
    peer_host_name: string;
    peer_host_platform: string;
    sync_group_id: string;
  }): Promise<void>;
  clearSyncGroupCredentials(): Promise<void>;
  loadSyncGroupProviderState(): Promise<CompanionSyncGroupProviderState>;
  loadSyncParticipationState(): Promise<CompanionSyncParticipationState>;
  setSyncEnabled(args: { sync_enabled: boolean }): Promise<CompanionSyncParticipationState>;
  setSyncPaused(args: { sync_paused: boolean }): Promise<CompanionSyncParticipationState>;
  approveSyncGroupJoinRequest(args: { pair_request_id: string }): Promise<CompanionSyncGroupProviderState>;
  rejectSyncGroupJoinRequest(args: { pair_request_id: string }): Promise<CompanionSyncGroupProviderState>;
  resolveSyncGroupDataRequest(args: {
    error?: string;
    request_id: string;
    result?: Record<string, unknown>;
  }): Promise<void>;
  startSyncGroupProvider(args: {
    app_version: string;
    authorization_id: string;
    device_id: string;
    device_name: string;
    facts_revision: string;
    host_name: string;
    host_platform: string;
    sync_group: import('../../../lib/platform/syncGroupContract').SyncGroupPayload;
    workgroup_key: string;
  }): Promise<CompanionSyncGroupProviderState>;
  stopSyncGroupProvider(): Promise<CompanionSyncGroupProviderState>;
  resolveAttachmentResource(args: {
    attachment_id: string;
    mime_type?: string | null;
    storage_key?: string | null;
  }): Promise<{
    mime_type?: string | null;
    resource_url: string | null;
    status: 'missing_file' | 'not_found' | 'ready';
  }>;
}
