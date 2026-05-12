export interface NativeRemovedSourceEntry {
  content: string | null;
  content_preview: string | null;
  deleted_at: string;
  first_seen_at: string;
  has_source_update: boolean;
  last_imported_at: string | null;
  last_node_id: string | null;
  last_seen_at: string;
  rule_id: string;
  source_path: string;
  source_state: 'present';
  title: string;
}

export interface NativeRemovedSourcesResult {
  entries: NativeRemovedSourceEntry[];
  loaded_at: string;
}

export interface NativeRestoreRemovedSourceArgs {
  rule_id: string;
  source_path: string;
}

export interface NativeRestoreRemovedSourceResult {
  detail: string | null;
  node_id: string | null;
  restored_at: string;
  status: 'failed' | 'restored';
}
