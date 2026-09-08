export type NativeReadwiseSourceCutoverStatus =
  | 'already_completed'
  | 'completed'
  | 'connection_required'
  | 'failed'
  | 'not_active_host'
  | 'ready'
  | 'source_unavailable';

export interface NativeReadwiseSourceCutoverPreview {
  status: Exclude<NativeReadwiseSourceCutoverStatus, 'completed' | 'failed'>;
  topic_count: number;
}

export interface NativeReadwiseSourceCutoverResult {
  migrated_count: number;
  status: Extract<NativeReadwiseSourceCutoverStatus, 'already_completed' | 'completed' | 'failed' | 'connection_required' | 'not_active_host' | 'source_unavailable'>;
  unmatched_count: number;
}
