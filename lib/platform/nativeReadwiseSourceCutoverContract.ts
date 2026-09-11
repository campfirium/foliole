export type NativeReadwiseSourceCutoverStatus =
  | 'already_completed'
  | 'completed'
  | 'connection_required'
  | 'failed'
  | 'migration_in_progress'
  | 'not_active_host'
  | 'ready';

export interface NativeReadwiseSourceCutoverPreview {
  status: Exclude<NativeReadwiseSourceCutoverStatus, 'completed' | 'failed'>;
  completed_count: number;
  error_reason: string | null;
  phase: 'indexing' | 'merging' | null;
  total_count: number | null;
  topic_count: number;
}

export interface NativeReadwiseSourceCutoverResult {
  error_reason: string | null;
  migrated_count: number;
  status: Extract<NativeReadwiseSourceCutoverStatus, 'already_completed' | 'completed' | 'failed' | 'connection_required' | 'not_active_host'>;
  unmatched_count: number;
}
