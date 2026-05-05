import type { WorkspaceSnapshot } from '../core/database/workspaceSnapshot.js';

export interface NativeCompanionWorkspaceSyncState {
  endpoint_url: string | null;
  last_synced_at: string | null;
  remembered_targets: string[];
  sync_onboarding_status: 'accepted' | 'completed' | 'dismissed' | 'pending';
  workspace_snapshot: WorkspaceSnapshot | null;
}

export interface NativeCompanionPairingState {
  device_id: string | null;
  device_kind: string | null;
  device_name: string | null;
  is_paired: boolean;
  paired_at: string | null;
}

export interface NativeCompanionSignedRequestHeaders {
  headers: {
    'X-Device-Id': string;
    'X-Nonce': string;
    'X-Signature': string;
    'X-Timestamp': string;
  };
}

export interface NativeCompanionDirtyNodeRecord {
  device_id: string;
  object_id: string;
  object_type: 'node';
  snapshot: NonNullable<WorkspaceSnapshot['nodesById'][string]>;
  updated_at: string;
}

export interface NativeCompanionDirtyNodePayload {
  device_id: string;
  last_synced_at: string | null;
  nodes: NativeCompanionDirtyNodeRecord[];
}

export interface NativeCompanionReadableArticlePayload {
  readable_article: {
    content: string;
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
}

export interface CompanionWorkspaceSnapshotPayload {
  app_version: string;
  desktop_name: string;
  exported_at: string;
  peer_id: string;
  workspace_version: string;
  workspace_snapshot: WorkspaceSnapshot | null;
}

export interface CompanionWorkspaceDiscoveryPayload {
  app_version: string;
  desktop_device_name: string;
  desktop_name: string;
  desktop_platform: string;
  host_name: string;
  pairing_mode: 'desktop-confirm';
  peer_id: string;
}

export interface CompanionWorkspacePairRequestPayload {
  expires_at: string;
  pair_request_id: string;
  status: 'pending';
}

export interface CompanionWorkspacePairPayload {
  device_id: string;
  device_secret: string;
  paired_at: string;
  peer_id: string;
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

export interface DesktopCompanionPairingOverviewPayload {
  paired_devices: DesktopCompanionPairedDevicePayload[];
  pending_requests: DesktopCompanionPairRequestPayload[];
  server_status: DesktopCompanionSyncServerStatusPayload;
  sync_enabled: boolean;
}
