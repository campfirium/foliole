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
  total_count: number | null;
  topic_count: number;
}

export interface NativeReadwiseSourceCutoverResult {
  migrated_count: number;
  status: Extract<NativeReadwiseSourceCutoverStatus, 'already_completed' | 'completed' | 'failed' | 'connection_required' | 'not_active_host'>;
  unmatched_count: number;
}
