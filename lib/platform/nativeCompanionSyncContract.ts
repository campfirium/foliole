import type { WorkspaceSnapshot } from '../core/database/workspaceSnapshot.js';

import type { SyncGroupPayload } from './syncGroupContract.js';
import type {
  SyncProtocolCompatibilityResult,
  SyncProtocolDescriptor
} from './syncProtocolContract.js';
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

export interface NativeCompanionPairingState {
  authorization_id?: string | null;
  host_name?: string | null;
  host_platform?: string | null;
  is_paired: boolean;
  negotiated_protocol_version?: number | null;
  paired_at: string | null;
  remote_peer_id?: string | null;
  remote_peer_name?: string | null;
  remote_peer_platform?: string | null;
  protocol_compatibility?: SyncProtocolCompatibilityResult;
  remote_protocol?: SyncProtocolDescriptor | null;
  repair_required?: boolean;
  sync_usable?: boolean;
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
  desktop_host_name: string;
  desktop_name: string;
  desktop_platform: string;
  pairing_mode: 'desktop-confirm';
  peer_id: string;
  runtime_instance_id: string;
  protocol: SyncProtocolDescriptor;
  group_display_name: string;
  group_id: string;
  group_tag: string;
  timeline_id: string;
}

export interface CompanionWorkspacePairRequestPayload {
  compatibility: SyncProtocolCompatibilityResult;
  desktop_protocol: SyncProtocolDescriptor;
  expires_at: string;
  pair_request_id: string;
  status: 'pending';
}

export interface CompanionPairingSecretPayload {
  algorithm: 'ECDH-P256-HKDF-SHA256-AES-GCM';
  ciphertext: string;
  iv: string;
  salt: string;
  server_public_key: string;
}

export interface CompanionWorkspacePairPayload {
  authorization_id: string;
  compatibility: SyncProtocolCompatibilityResult;
  host_name?: string;
  host_platform?: string;
  encrypted_credential_secret: CompanionPairingSecretPayload;
  paired_at: string;
  peer_id: string;
  desktop_protocol: SyncProtocolDescriptor;
  sync_group?: import('./syncGroupContract.js').SyncGroupPayload;
  provider_authorization_id?: string;
  provider_host_name?: string;
  provider_host_platform?: string;
  provider_encrypted_credential_secret?: CompanionPairingSecretPayload;
}

export interface DesktopCompanionPairRequestPayload {
  client_address: string | null;
  host_name: string;
  host_platform: string;
  expires_at: string;
  pair_request_id: string;
  requested_at: string;
  status: 'approved' | 'pending' | 'rejected';
}

export interface DesktopCompanionAuthorizationPayload {
  authorization_id: string;
  client_address: string | null;
  host_name: string;
  host_platform: string;
  paired_at: string;
}

export interface DesktopCompanionSyncServerStatusPayload {
  advertised_urls: string[];
  last_error: string | null;
  paired_authorization_count: number;
  pending_pair_request_count: number;
  port: number | null;
  state: 'failed' | 'running' | 'stopped';
}

export interface DesktopSyncGroupJoinCandidatePayload {
  endpoint_url: string;
  group_display_name: string;
  group_id: string;
  group_tag: string;
  provider_authorization_id: string;
  provider_host_name: string;
  provider_host_platform: string;
  timeline_id: string;
}

export interface DesktopSyncGroupJoinRequestPayload {
  endpoint_url: string;
  expires_at: string;
  group_id: string;
  pair_request_id: string;
  status: 'pending';
  timeline_id: string;
}

export interface DesktopCompanionPairingOverviewPayload {
  current_host?: { host_name: string; host_platform: string } | null;
  join_candidates?: DesktopSyncGroupJoinCandidatePayload[];
  join_request?: DesktopSyncGroupJoinRequestPayload | null;
  paired_authorizations: DesktopCompanionAuthorizationPayload[];
  pending_requests: DesktopCompanionPairRequestPayload[];
  server_status: DesktopCompanionSyncServerStatusPayload;
  sync_group?: SyncGroupPayload | null;
  sync_enabled: boolean;
  sync_paused: boolean;
  participating: boolean;
}
