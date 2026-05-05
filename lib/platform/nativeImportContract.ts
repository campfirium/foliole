import type { NativeReadwiseDetectionSample } from './nativeReadwiseContract.js';

export type NativeImportHighlightPolicy = 'adopt' | 'reference_only';

export type NativeDirectoryImportSourceAdapter = 'external_directory' | 'foliole_managed_inbox_folder';

export type NativeManagedInboxConsumePolicy = 'archive' | 'clear';

export type NativeDirectoryImportConsumePolicy = 'archive' | 'clear' | 'keep';

export interface NativeTextImportArgs {
  highlight_policy?: NativeImportHighlightPolicy;
}

export interface NativeDirectoryImportArgs extends NativeTextImportArgs {
  directory_path?: string;
  consume_policy?: NativeManagedInboxConsumePolicy;
  source_adapter?: NativeDirectoryImportSourceAdapter;
}

export interface NativeKeepImportPreviewArgs {
  directory_path: string;
  highlight_policy?: NativeImportHighlightPolicy;
  rule_id: string;
  source_type?: 'generic' | 'readwise';
}

export interface NativeKeepImportPreviewEntry {
  detail: string | null;
  detected_highlight_count?: number;
  highlight_samples?: NativeReadwiseDetectionSample[];
  source_path: string;
  status: 'blocked_deleted' | 'failed' | 'new' | 'unchanged' | 'updated';
}

export interface NativeKeepImportPreviewResult {
  blocked_count: number;
  discovered_count: number;
  entries: NativeKeepImportPreviewEntry[];
  failed_count: number;
  new_count: number;
  previewed_at: string;
  root_path: string;
  unchanged_count: number;
  updated_count: number;
}

export interface NativeImportedTextFile {
  file_name: string;
  file_path: string;
  content: string;
  kind: 'epub' | 'html' | 'markdown' | 'text';
}

export interface NativeTextImportResult {
  import_id: string;
  provider: 'desktop_text_file';
  source_name: string;
  source_locator: string;
  source_kind: 'epub' | 'html' | 'markdown' | 'text';
  source_fingerprint: string;
  content_fingerprint: string;
  duplicate_semantic: 'new' | 'updated' | 'duplicate';
  result_status: 'imported' | 'degraded' | 'failed';
  imported_at: string;
  node_id: string | null;
  degraded_reason: string | null;
  failure_reason: string | null;
}

export interface NativeDirectoryImportEntry extends NativeTextImportResult {
  adapter: 'html_directory' | 'markdown_directory' | 'obsidian_vault' | 'text_directory';
}

export interface NativeDirectoryImportResult {
  archive_root_path: string | null;
  consume_policy: NativeDirectoryImportConsumePolicy;
  consumed_count: number;
  root_path: string;
  source_adapter: NativeDirectoryImportSourceAdapter;
  discovered_count: number;
  imported_count: number;
  failed_count: number;
  entries: NativeDirectoryImportEntry[];
}

export interface NativeImportOverview {
  latest_failure: NativeTextImportResult | null;
  latest_result: NativeTextImportResult | null;
  recent_runs: NativeTextImportResult[];
}

export interface NativeNodeImportSource {
  first_imported_at: string;
  last_content_fingerprint: string;
  last_imported_at: string;
  latest_node_id: string | null;
  provider: string;
  source_fingerprint: string;
  source_kind: string;
  source_locator: string;
  source_name: string;
}

export interface NativeKeepImportItemDetails {
  first_seen_at: string;
  highlight_path: string | null;
  keep_state: 'draft' | 'enabled' | 'previewed' | null;
  last_imported_at: string | null;
  last_seen_at: string;
  last_status: 'blocked_deleted' | 'degraded' | 'duplicate' | 'failed' | 'imported';
  primary_path: string | null;
  rule_id: string;
  rule_label: string | null;
  source_mtime_ms: number;
  source_path: string;
  source_size_bytes: number;
  source_type: 'generic' | 'readwise' | null;
}

export interface NativeNodeSourceDetails {
  import_runs: NativeTextImportResult[];
  import_source: NativeNodeImportSource | null;
  inherited_from_parent: boolean;
  keep_import_item: NativeKeepImportItemDetails | null;
  source_node_id: string;
}

export interface NativeNodeSourceUpdatePreview {
  checked_at: string;
  current_content: string;
  source_node_id: string;
  updated_content: string;
}
