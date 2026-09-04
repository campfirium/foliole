import type { NativeCompanionSignedRequestHeaders } from '../../../lib/platform/nativeCompanionSyncContract';
import type { SyncParticipationSnapshot } from '../../../lib/platform/syncParticipationContract';
import type { SyncTriggerReason } from '../../../lib/platform/syncTriggerContract';

import type { CompanionAttachmentResourceSyncPlugin } from './companionAttachmentResourceSyncPluginTypes';
import type { CompanionContentBlobSyncPlugin } from './companionContentBlobSyncPluginTypes';

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

export interface CompanionSyncGroupProviderState {
  pending_requests: Array<{
    device_name: string;
    platform: string;
    request_id: string;
    requested_at: string;
  }>;
  port: number | null;
  state: 'running' | 'stopped';
}

export type CompanionSyncParticipationState = SyncParticipationSnapshot;

export interface CompanionWorkspaceSyncPlugin
  extends CompanionAttachmentResourceSyncPlugin, CompanionContentBlobSyncPlugin {
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
  loadSyncGroupDeviceIdentity(args: { database_path: string }): Promise<{
    canonical_library_path: string;
    device_anchor: string;
    device_name: string;
    path_flavor: 'posix';
    platform: string;
  }>;
  startDiscoverySession(): Promise<CompanionNativeDiscoveryEvent>;
  stopDiscoverySession(): Promise<CompanionNativeDiscoveryEvent>;
  addListener(
    eventName: 'syncGroupDiscoveryChanged',
    listener: (event: CompanionNativeDiscoveryEvent) => void
  ): Promise<import('@capacitor/core').PluginListenerHandle>;
  loadSyncGroupProviderState(): Promise<CompanionSyncGroupProviderState>;
  loadSyncParticipationState(): Promise<CompanionSyncParticipationState>;
  setSyncEnabled(args: { sync_enabled: boolean }): Promise<CompanionSyncParticipationState>;
  setSyncPaused(args: { sync_paused: boolean }): Promise<CompanionSyncParticipationState>;
  acceptSyncGroupJoinRequest(args: { request_id: string }): Promise<CompanionSyncGroupProviderState>;
  rejectSyncGroupJoinRequest(args: { request_id: string }): Promise<CompanionSyncGroupProviderState>;
  resolveSyncGroupDataRequest(args: {
    error?: string;
    request_id: string;
    result?: Record<string, unknown>;
  }): Promise<void>;
  signCompanionSyncRequest(args: {
    body?: string;
    body_hash: string;
    endpoint_url?: string;
    method: string;
    nonce: string;
    path_with_query: string;
    sync_group_id: string;
    timestamp: string;
  }): Promise<NativeCompanionSignedRequestHeaders>;
  startSyncGroupProvider(args: {
    app_version: string;
    device_id: string;
    device_name: string;
    facts_revision: string;
    platform: string;
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
