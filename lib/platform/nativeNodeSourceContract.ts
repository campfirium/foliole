import type { NativeTextImportResult } from './nativeImportContract.js';
import type { NativeReadwiseOriginalFileResult } from './nativeReadwiseApiImportContract.js';

export interface NativeNodeImportSource {
  first_imported_at: string;
  last_content_fingerprint: string;
  last_imported_at: string;
  latest_node_id: string | null;
  pdf_index_status?: 'failed' | 'indexing' | 'pending' | 'ready' | null;
  pdf_indexed_at?: string | null;
  provider: string;
  readwise_original_file?: NativeReadwiseOriginalFileResult | null;
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
