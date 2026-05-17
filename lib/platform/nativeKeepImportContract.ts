import type { NativeReadwiseDetectionSample } from './nativeReadwiseContract.js';

export type NativeImportHighlightPolicy = 'adopt' | 'reference_only';

export interface NativeKeepImportPreviewArgs {
  directory_path: string;
  highlight_mode?: 'merged' | 'split';
  highlight_policy?: NativeImportHighlightPolicy;
  rule_id: string;
  source_type?: 'generic' | 'readwise';
}

export interface NativeKeepImportPreviewEntry {
  content_preview?: string | null;
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
