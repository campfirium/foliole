import type { WorkspaceSnapshot } from '../core/database/workspaceSnapshot.js';

import type { SyncGroupPayload } from './syncGroupContract.js';
import type {
  SyncProtocolCompatibilityResult,
  SyncProtocolDescriptor
} from './syncProtocolContract.js';

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
  device_id: string | null;
  device_kind: string | null;
  device_name: string | null;
  is_paired: boolean;
  negotiated_protocol_version?: number | null;
  paired_at: string | null;
  primary_device_id: string | null;
  remote_peer_id?: string | null;
  remote_peer_name?: string | null;
  remote_peer_platform?: string | null;
  protocol_compatibility?: SyncProtocolCompatibilityResult;
  remote_protocol?: SyncProtocolDescriptor | null;
  repair_required?: boolean;
  sync_usable?: boolean;
}

export interface NativeCompanionSignedRequestHeaders {
  headers: {
    'X-Device-Id': string;
    'X-Nonce': string;
    'X-Signature': string;
    'X-Timestamp': string;
  };
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
  desktop_device_name: string;
  desktop_name: string;
  desktop_platform: string;
  pairing_mode: 'desktop-confirm';
  peer_id: string;
  protocol: SyncProtocolDescriptor;
  group_display_name: string;
  group_id: string;
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
  compatibility: SyncProtocolCompatibilityResult;
  device_id: string;
  encrypted_device_secret: CompanionPairingSecretPayload;
  paired_at: string;
  peer_id: string;
  desktop_protocol: SyncProtocolDescriptor;
  sync_group?: import('./syncGroupContract.js').SyncGroupPayload;
  member_authorization_id?: string;
  provisioning_cursor?: number;
  provider_device_id?: string;
  provider_device_kind?: string;
  provider_device_name?: string;
  provider_encrypted_device_secret?: CompanionPairingSecretPayload;
}

export interface DesktopCompanionPairRequestPayload {
  client_address: string | null;
  device_id: string;
  device_kind: string;
  device_name: string;
  expires_at: string;
  pair_request_id: string;
  requested_at: string;
  status: 'approved' | 'pending' | 'rejected';
}

export interface DesktopCompanionPairedDevicePayload {
  client_address: string | null;
  device_id: string;
  device_kind: string;
  device_name: string;
  paired_at: string;
}

export interface DesktopCompanionSyncServerStatusPayload {
  advertised_urls: string[];
  last_error: string | null;
  paired_device_count: number;
  pending_pair_request_count: number;
  port: number | null;
  state: 'failed' | 'running' | 'stopped';
}

export interface DesktopSyncGroupJoinCandidatePayload {
  endpoint_url: string;
  group_display_name: string;
  group_id: string;
  provider_device_id: string;
  provider_device_kind: string;
  provider_device_name: string;
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

export type NativePrimaryDeviceRole = 'primary' | 'secondary' | 'unknown';
export type NativePrimaryDeviceSource =
  | 'committed-primary-device'
  | 'companion-paired-primary'
  | 'desktop-paired-default'
  | 'paired-primary-missing'
  | 'self-unpaired';
export type NativePrimaryDeviceTakeoverBlockedReason =
  | 'control-message-carrier-missing'
  | 'no-current-primary-device'
  | 'release-ack-missing'
  | 'sync-latest-confirmation-missing';

export interface NativePrimaryDeviceStatePayload {
  can_initiate_takeover: boolean;
  local_role: NativePrimaryDeviceRole;
  primary_device_id: string | null;
  source: NativePrimaryDeviceSource;
  takeover_blocked_reasons: NativePrimaryDeviceTakeoverBlockedReason[];
}

export interface NativePrimaryDeviceTakeoverPayload {
  android_pack_cursor: number;
  candidate_device_id: string;
  desktop_max_state_seq: number;
  local_dirty_count: number;
  pending_ack_count: number;
  push_issue_count: number;
}

export interface NativePrimaryDeviceTakeoverResponse {
  committed_at: string;
  primary_device_epoch: number;
  primary_device_id: string;
  release_ack: true;
  updated_by_device_id: string;
}

export interface DesktopCompanionPairingOverviewPayload {
  join_candidates?: DesktopSyncGroupJoinCandidatePayload[];
  join_request?: DesktopSyncGroupJoinRequestPayload | null;
  paired_devices: DesktopCompanionPairedDevicePayload[];
  pending_requests: DesktopCompanionPairRequestPayload[];
  primary_device_state: NativePrimaryDeviceStatePayload;
  server_status: DesktopCompanionSyncServerStatusPayload;
  sync_group?: SyncGroupPayload | null;
  sync_enabled: boolean;
}
