import type { WorkspaceSnapshot } from '../core/database/workspaceSnapshot.js';

import type { SyncGroupPayload } from './syncGroupContract.js';
import type { SyncProtocolDescriptor } from './syncProtocolContract.js';
import type { SyncTriggerReason } from './syncTriggerContract.js';

export type { NativeCompanionSignedRequestHeaders } from './nativeCompanionSignedRequestContract.js';

export interface NativeCompanionSyncEvent {
  endpoint_url: string | null;
  id: string;
  kind?: 'diagnostic' | 'legacy_event' | 'run_finished' | 'run_started' | 'stage_finished';
  message: string;
  occurred_at: string;
  result?: 'blocked' | 'cancelled' | 'completed' | 'failed' | 'partial' | 'retrying' | 'system_fault' | 'waiting';
  run_id?: string;
  started_at?: string;
  status: 'completed' | 'failed' | 'skipped' | 'started';
  summary?: NativeCompanionSyncEventSummary;
  trigger_reason?: SyncTriggerReason;
}

export interface NativeCompanionSyncEventSummary {
  change_count: number;
  desktop_review_count?: number;
  duration_ms?: number;
  waiting_confirmation_count?: number;
  waiting_send_count?: number;
}

export interface NativeCompanionWorkspaceSyncState {
  endpoint_url: string | null;
  last_synced_at: string | null;
  remembered_targets: string[];
  sync_events: NativeCompanionSyncEvent[];
  sync_onboarding_status: 'accepted' | 'completed' | 'dismissed' | 'pending';
  workspace_snapshot: WorkspaceSnapshot | null;
}

export interface NativeCompanionReadableArticlePayload {
  readable_article: {
    content: string;
    body_blob_hash?: string | null;
    content_status?: 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';
    node_id: string;
    title: string;
  } | null;
}

export interface CompanionWorkspaceVersionPayload {
  app_version: string;
  desktop_name: string;
  exported_at: string;
  has_snapshot: boolean;
  peer_id: string;
  workspace_version: string | null;
}

export interface CompanionWorkspaceDiscoveryPayload {
  app_version: string;
  group_display_name: string;
  group_id: string;
  group_tag: string;
  protocol: SyncProtocolDescriptor;
  provider_device_id: string;
  provider_device_name: string;
  provider_platform: string;
  runtime_instance_id: string;
}

export interface SyncGroupJoinEncryptedInfoPayload {
  algorithm: 'ECDH-P256-HKDF-SHA256-AES-GCM';
  ciphertext: string;
  iv: string;
  salt: string;
  server_public_key: string;
}

export interface DesktopSyncGroupJoinRequestSummaryPayload {
  device_name: string;
  expires_at: string;
  platform: string;
  request_id: string;
  requested_at: string;
  status: 'accepted' | 'pending';
}

export interface DesktopCompanionSyncServerStatusPayload {
  active_device_count: number;
  advertised_urls: string[];
  last_error: string | null;
  pending_join_request_count: number;
  port: number | null;
  state: 'failed' | 'running' | 'stopped';
}

export interface DesktopSyncGroupJoinCandidatePayload {
  endpoint_url: string;
  group_display_name: string;
  group_id: string;
  group_tag: string;
  provider_device_id: string;
  provider_device_name: string;
  provider_platform: string;
}

export interface DesktopSyncGroupJoinRequestPayload {
  endpoint_url: string;
  expires_at: string;
  group_id: string;
  request_id: string;
  status: 'pending';
}

export interface DesktopSyncGroupOverviewPayload {
  current_device?: { device_name: string; platform: string } | null;
  join_candidates?: DesktopSyncGroupJoinCandidatePayload[];
  join_request?: DesktopSyncGroupJoinRequestPayload | null;
  join_requests: DesktopSyncGroupJoinRequestSummaryPayload[];
  server_status: DesktopCompanionSyncServerStatusPayload;
  sync_group?: SyncGroupPayload | null;
  sync_enabled: boolean;
  sync_paused: boolean;
  participating: boolean;
}
