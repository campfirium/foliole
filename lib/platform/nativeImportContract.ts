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
  rule_id: string;
}

export interface NativeKeepImportPreviewEntry {
  detail: string | null;
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
