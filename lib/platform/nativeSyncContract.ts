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
  object_type: 'node';
  sync_version_id: string | null;
  updated_at: string;
}

export interface NativeSyncNodeAttachmentRef {
  attachment_id: string;
  role: string;
}

export interface NativeSyncNodeRecord {
  ancestor_version_ids: string[];
  content_hash: string | null;
  device_id: string | null;
  object_id: string;
  object_type: 'node';
  parent_version_id: string | null;
  snapshot: {
    anchor_link: string | null;
    attachments: NativeSyncNodeAttachmentRef[];
    content: string;
    created_at: string;
    deleted_at: string | null;
    desired_retention: number | null;
    hide_title_heading: boolean;
    id: string;
    image_regions: string | null;
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
