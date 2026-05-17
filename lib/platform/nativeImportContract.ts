import type { NativeImportHighlightPolicy } from './nativeKeepImportContract.js';

export type { NativeImportHighlightPolicy } from './nativeKeepImportContract.js';
export type NativeImportNodeTitleStrategy = 'file_name' | 'heading';

export type NativeDirectoryImportSourceAdapter =
  | 'external_directory'
  | 'foliole_managed_inbox_folder';

export type NativeManagedInboxConsumePolicy = 'archive' | 'clear';

export type NativeDirectoryImportConsumePolicy = 'archive' | 'clear' | 'keep';

export interface NativeTextImportArgs {
  highlight_policy?: NativeImportHighlightPolicy;
  title_strategy?: NativeImportNodeTitleStrategy;
}

export interface NativeDirectoryImportArgs extends NativeTextImportArgs {
  directory_path?: string;
  consume_policy?: NativeManagedInboxConsumePolicy;
  source_adapter?: NativeDirectoryImportSourceAdapter;
}

export type NativeReadwiseSyncPreviewDestination = 'external' | 'inbox' | 'off';
export type NativeReadwiseSyncPreviewHighlightType = 'with_highlights' | 'without_highlights';
export type NativeReadwiseSyncPreviewHighlightStatus = 'highlight_only' | 'unparsed' | NativeReadwiseSyncPreviewHighlightType;
export type NativeReadwiseSyncPreviewSourceKind = 'articles' | 'books' | 'podcasts' | 'tweets';
export type NativeReadwiseSyncPreviewStatus = 'blocked_deleted' | 'failed' | 'new' | 'off' | 'unchanged' | 'unparsed' | 'updated';

export interface NativeReadwiseImportRunProgressEvent {
  currentSourcePath?: string | null;
  highlightProcessedCount?: number;
  highlightTotalCount?: number;
  importWriteElapsedMs?: number;
  indexFailedCount?: number;
  indexElapsedMs?: number;
  indexPendingCount?: number;
  indexProcessedCount?: number;
  indexTotalCount?: number;
  phase?: 'indexing' | 'scanning' | 'writing' | 'source_completed';
  processedCount: number;
  sourceProcessedCount?: number;
  sourceTotalCount?: number;
  status: 'cancelled' | 'running' | 'completed' | 'failed';
  totalCount: number;
}

export interface NativeReadwiseImportRunFailedSource {
  reason: string;
  source_kind: NativeReadwiseSyncPreviewSourceKind;
  source_path: string;
}

export interface NativeReadwiseSyncPreviewEntry {
  blocked_location?: 'trash' | 'removed';
  destination: NativeReadwiseSyncPreviewDestination;
  detail: string | null;
  detected_highlight_count: number;
  highlight_status?: NativeReadwiseSyncPreviewHighlightStatus;
  highlight_type: NativeReadwiseSyncPreviewHighlightType;
  open_path?: string | null;
  source_kind: NativeReadwiseSyncPreviewSourceKind;
  source_path: string;
  status: NativeReadwiseSyncPreviewStatus;
}

export interface NativeReadwiseSyncPreviewResult {
  active_count: number;
  blocked_count: number;
  entries: NativeReadwiseSyncPreviewEntry[];
  external_count: number;
  failed_count: number;
  inbox_count: number;
  off_count: number;
  previewed_at: string;
  readwise_root_path: string;
  trash_count: number;
  total_count: number;
  removed_count: number;
  with_highlights_count: number;
  without_highlights_count: number;
  write_count: number;
}

export interface NativeReadwiseImportRunResult {
  completed_at: string;
  entry_count?: number;
  failed_count: number;
  failed_sources?: NativeReadwiseImportRunFailedSource[];
  imported_count?: number;
  source_count: number;
  skipped_count?: number;
  status: 'cancelled' | 'completed' | 'failed';
}

export interface NativeReadwiseImportCancelResult {
  status: 'cancelled' | 'idle';
}

export type NativeReadwiseCleanupAction = 'delete' | 'keep';

export interface NativeReadwiseCleanupEntry {
  action: NativeReadwiseCleanupAction;
  node_id: string;
  reason: string;
  rule_id: string;
  source_path: string;
  title: string;
}

export interface NativeReadwiseCleanupPreviewResult {
  delete_count: number;
  entries: NativeReadwiseCleanupEntry[];
  external_document_count: number;
  external_folder_count: number;
  keep_count: number;
  previewed_at: string;
  tracking_only_count: number;
  total_count: number;
}

export interface NativeReadwiseCleanupRunResult extends NativeReadwiseCleanupPreviewResult {
  cleaned_at: string;
  deleted_count: number;
  detached_count: number;
  external_deleted_count: number;
  status: 'completed';
}

export interface NativeImportedTextFile {
  file_name: string;
  file_path: string;
  content: string;
  kind: 'epub' | 'html' | 'markdown' | 'pdf' | 'text';
}

export interface NativeTextImportResult {
  import_id: string;
  provider: 'desktop_text_file';
  source_name: string;
  source_locator: string;
  source_kind: 'epub' | 'html' | 'markdown' | 'pdf' | 'text';
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

export interface NativePdfImportInventoryItem {
  last_imported_at: string;
  latest_node_id: string | null;
  node_status: 'deleted' | 'generated' | 'missing';
  pdf_index_status: 'failed' | 'indexing' | 'pending' | 'ready' | null;
  pdf_indexed_at: string | null;
  source_fingerprint: string;
  source_locator: string;
  source_name: string;
}

export interface NativePdfImportsInventory {
  items: NativePdfImportInventoryItem[];
  scanned_at: string;
}

export interface NativeNodeImportSource {
  first_imported_at: string;
  last_content_fingerprint: string;
  last_imported_at: string;
  latest_node_id: string | null;
  pdf_index_status?: 'failed' | 'indexing' | 'pending' | 'ready' | null;
  pdf_indexed_at?: string | null;
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
  local_node_state: 'active' | 'locally_deleted' | 'not_imported';
  primary_path: string | null;
  rule_id: string;
  rule_label: string | null;
  source_mtime_ms: number;
  source_path: string;
  source_size_bytes: number;
  source_state: 'missing' | 'present';
  source_type: 'generic' | 'readwise' | null;
}

export interface NativeNodeSourceDetails {
  import_runs: NativeTextImportResult[];
  import_source: NativeNodeImportSource | null;
  inherited_from_parent: boolean;
  keep_import_item: NativeKeepImportItemDetails | null;
  pdf_page_dimensions: Array<{
    page: number;
    page_height: number | null;
    page_width: number | null;
  }>;
  source_node_id: string;
}

export interface NativeNodeSourceUpdatePreview {
  checked_at: string;
  current_highlight_count: number;
  current_content: string;
  source_node_id: string;
  updated_highlight_count: number;
  updated_content: string;
}
