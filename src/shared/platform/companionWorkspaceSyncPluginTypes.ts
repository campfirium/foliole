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

export interface CompanionSyncGroupProviderState {
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

export interface CompanionWorkspaceSyncPlugin
  extends CompanionAttachmentResourceSyncPlugin, CompanionContentBlobSyncPlugin, CompanionPairingSyncPlugin {
  desktopHttpRequest(args: {
    body?: string;
    headers?: Record<string, string>;
    method: string;
    url: string;
  }): Promise<{ body: string; status: number }>;
  loadDiscoveryCandidates(): Promise<CompanionDiscoveryCandidatesPayload>;
  loadSyncGroupProviderState(): Promise<CompanionSyncGroupProviderState>;
  approveSyncGroupJoinRequest(args: { pair_request_id: string }): Promise<CompanionSyncGroupProviderState>;
  rejectSyncGroupJoinRequest(args: { pair_request_id: string }): Promise<CompanionSyncGroupProviderState>;
  resolveSyncGroupDataRequest(args: {
    error?: string;
    request_id: string;
    result?: Record<string, unknown>;
  }): Promise<void>;
  startSyncGroupProvider(args: {
    app_version: string;
    device_id: string;
    device_name: string;
    sync_group: import('../../../lib/platform/syncGroupContract').SyncGroupPayload;
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
