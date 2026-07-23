export type NativeSyncObjectType =
  | 'attachment'
  | 'external_document'
  | 'external_folder'
  | 'import_run'
  | 'import_source'
  | 'node'
  | 'node_open_state'
  | 'node_reading'
  | 'node_review'
  | 'pdf_page_text'
  | 'setting'
  | 'view_state';

export interface NativeSyncPeer {
  last_seen_version_cursor: string | null;
  last_synced_at: string | null;
  peer_id: string;
  status: 'paired' | 'revoked' | 'stale';
  updated_at: string;
}

export interface NativeSyncIndexEntry {
  content_hash: string | null;
  object_id: string;
  object_type: NativeSyncObjectType;
  sync_version_id: string | null;
  updated_at: string;
}

export interface NativeSyncObjectRecord {
  content_hash: string;
  deleted_at: string | null;
  object_id: string;
  object_type: Exclude<NativeSyncObjectType, 'import_run' | 'node'>;
  payload_json: string | null;
  updated_at: string;
}

export interface NativeSyncStateObjectRecord extends NativeSyncObjectRecord {
  base_content_hash?: string | null;
  state_seq: number;
}

export interface NativeSyncPackApplyResult {
  applied_blob_count: number;
  applied_object_count: number;
  applied_review_op_ids?: string[];
  pre_sync_backup_path?: string;
  to_state_seq: number;
}

export interface NativeSyncChangeCursor {
  change_id: string;
  created_at: string;
}

export interface NativeSyncReviewLogRecord {
  difficulty_after: number;
  difficulty_before: number;
  due_after: string;
  due_before: string;
  grade: number;
  id: string;
  node_id: string;
  op_id: string;
  reviewed_at: string;
  scheduler_version: string;
  stability_after: number;
  stability_before: number;
  device_id: string;
}

export interface NativeSyncReviewLogDraft {
  cardAfter: {
    due: string;
    stability: number;
    difficulty: number;
  };
  cardBefore: {
    due: string;
    stability: number;
    difficulty: number;
  };
  grade: 1 | 2 | 3 | 4;
  reviewedAt: string;
  schedulerVersion: string;
}

export interface NativeSyncNodeAttachmentRef {
  attachment_id: string;
  role: string;
}

export interface NativeSyncNodeRecord {
  ancestor_version_ids: string[];
  content_hash: string | null;
  device_id: string | null;
  is_tombstone?: boolean;
  object_id: string;
  object_type: 'node';
  parent_version_id: string | null;
  snapshot: {
    anchor_link: string | null;
    attachments: NativeSyncNodeAttachmentRef[];
    body_blob_hash?: string | null;
    content?: string;
    created_at: string;
    deleted_at: string | null;
    desired_retention: number | null;
    enable_short_term?: boolean | null;
    sequential_reading_enabled?: boolean | null;
    shelved_at?: string | null;
    manual_child_order?: string | null;
    hide_title_heading: boolean;
    id: string;
    image_regions: string | null;
    import_content_fingerprint?: string | null;
    import_source_fingerprint?: string | null;
    is_title_manual: boolean;
    kind: string;
    opening_text: string | null;
    parent_id: string | null;
    position: number | null;
    priority: number | null;
    reveal: string | null;
    title: string;
    updated_at: string;
    virtual_filter: string | null;
  };
  updated_at: string;
  version_created_at: string | null;
  version_id: string | null;
}

export interface NativeSyncNodeConflictRecord {
  conflict_version_id: string | null;
  content_hash: string | null;
  detected_at?: string;
  device_id: string | null;
  object_id: string;
  parent_version_id: string | null;
  snapshot: NativeSyncNodeRecord['snapshot'];
  updated_at: string;
}
