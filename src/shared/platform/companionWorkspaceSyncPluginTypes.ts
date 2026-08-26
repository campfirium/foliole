import type { SyncParticipationSnapshot } from '../../../lib/platform/syncParticipationContract';
import type { SyncTriggerReason } from '../../../lib/platform/syncTriggerContract';

import type { CompanionAttachmentResourceSyncPlugin } from './companionAttachmentResourceSyncPluginTypes';
import type { CompanionContentBlobSyncPlugin } from './companionContentBlobSyncPluginTypes';
import type { CompanionPairingSyncPlugin } from './companionPairingSyncPluginTypes';

export interface CompanionDiscoveryCandidate {
  endpoint_url: string;
  protocol_txt?: Record<string, string>;
  source: 'direct' | 'nsd';
}

export interface CompanionDiscoveryCandidatesPayload {
  candidates: CompanionDiscoveryCandidate[];
}

export interface CompanionNativeDiscoveryEvent extends CompanionDiscoveryCandidatesPayload {
  change: 'started' | 'found' | 'changed' | 'lost' | 'failed' | 'stopped';
  error_code: string | null;
  status: 'searching' | 'results' | 'permission_required' | 'unavailable' | 'stopped';
}

export interface CompanionSyncGroupProviderState extends SyncParticipationSnapshot {
  pending_requests: Array<{
    host_name: string;
    host_platform: string;
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
  beginSyncRun(args: { reason: SyncTriggerReason; run_id: string }): Promise<{
    reason: SyncTriggerReason;
    run_id: string;
    runtime: 'android' | 'ios';
  }>;
  loadDiscoveryCandidates(): Promise<CompanionDiscoveryCandidatesPayload>;
  startDiscoverySession(): Promise<CompanionNativeDiscoveryEvent>;
  stopDiscoverySession(): Promise<CompanionNativeDiscoveryEvent>;
  addListener(
    eventName: 'syncGroupDiscoveryChanged',
    listener: (event: CompanionNativeDiscoveryEvent) => void
  ): Promise<import('@capacitor/core').PluginListenerHandle>;
  bindSyncGroupPeerRoute(args: {
    endpoint_url: string;
    local_authorization_id: string;
    local_host_name: string;
    peer_authorization_id: string;
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
    facts_revision: string;
    host_name: string;
    host_platform: string;
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
