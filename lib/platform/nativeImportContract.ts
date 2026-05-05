export type NativeImportHighlightPolicy = 'adopt' | 'reference_only';

export interface NativeTextImportArgs {
  highlight_policy?: NativeImportHighlightPolicy;
}

export interface NativeDirectoryImportArgs extends NativeTextImportArgs {
  directory_path?: string;
}

export interface NativeImportedTextFile {
  file_name: string;
  file_path: string;
  content: string;
  kind: 'html' | 'markdown' | 'text';
}

export interface NativeTextImportResult {
  import_id: string;
  provider: 'desktop_text_file';
  source_name: string;
  source_locator: string;
  source_kind: 'html' | 'markdown' | 'text';
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
  adapter: 'html_directory' | 'markdown_directory' | 'obsidian_vault';
}

export interface NativeDirectoryImportResult {
  root_path: string;
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
