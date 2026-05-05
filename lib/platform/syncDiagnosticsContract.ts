export type SyncDiagnosticHost = 'android' | 'desktop';

export type SyncDiagnosticSeverity = 'error' | 'info' | 'ok' | 'warning';

export interface SyncDiagnosticCountRange {
  count: number;
  dirty_count?: number;
  max_state_seq: number | null;
  min_state_seq: number | null;
  object_type: string;
}

export interface SyncDiagnosticDirtyObject {
  base_content_hash?: string | null;
  content_hash: string | null;
  object_id: string;
  object_type: string;
  state_seq: number | null;
  updated_at: string | null;
}

export interface SyncDiagnosticPendingAck {
  acked_at: string;
  client_op_id: string;
  object_id: string;
  object_type: string;
  state_seq: number | null;
  status: string;
}

export interface SyncDiagnosticIdentity {
  app_version: string | null;
  device_id: string | null;
  device_name?: string | null;
  database_path?: string | null;
}

export interface SyncDiagnosticConnection {
  endpoint_url: string | null;
  last_error: string | null;
  paired_device_count?: number;
  pending_pair_request_count?: number;
  port?: number | null;
  state: 'failed' | 'missing' | 'ready' | 'running' | 'stopped';
}

export interface SyncDiagnosticStorage {
  active_node_count: number;
  content_blob_count: number;
  external_document_count: number;
  missing_node_state_count: number;
  missing_node_version_count: number;
  node_blob_references_missing_rows: number;
}

export interface SyncDiagnosticState {
  dirty_objects?: SyncDiagnosticDirtyObject[];
  local_dirty_count: number;
  max_state_seq: number | null;
  pack_cursor: number | null;
  pending_ack_count?: number;
  pending_acks?: SyncDiagnosticPendingAck[];
  state_counts: SyncDiagnosticCountRange[];
}

export interface SyncDiagnosticContent {
  active_topic?: {
    body_status: 'cached' | 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';
    id: string;
    title: string;
  } | null;
  missing_attachment_resource_count?: number;
  missing_attachment_resource_bytes?: number;
  missing_due_review_attachment_resource_count?: number;
  missing_due_review_body_count?: number;
  missing_content_blob_count: number;
  missing_content_blob_bytes?: number;
  missing_external_document_body_count?: number;
  missing_topic_body_count?: number;
  recent_topics?: Array<{
    body_blob_hash: string | null;
    blob_availability: string | null;
    id: string;
    title: string;
  }>;
}

export interface SyncDiagnosticEvent {
  endpoint_url: string | null;
  id?: string;
  message: string;
  occurred_at: string;
  status: 'completed' | 'failed' | 'skipped' | 'started';
}

export interface SyncDiagnosticVerdict {
  code: string;
  evidence: Record<string, unknown>;
  message: string;
  severity: SyncDiagnosticSeverity;
}

export interface SyncDiagnosticSnapshot {
  collected_at: string;
  connection: SyncDiagnosticConnection;
  content: SyncDiagnosticContent;
  events: SyncDiagnosticEvent[];
  host: SyncDiagnosticHost;
  identity: SyncDiagnosticIdentity;
  storage: SyncDiagnosticStorage;
  sync_state: SyncDiagnosticState;
  verdicts: SyncDiagnosticVerdict[];
}
