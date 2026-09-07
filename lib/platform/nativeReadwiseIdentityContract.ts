export interface NativeReadwiseIdentityBindingPreview {
  annotation_count: number;
  candidate_count: number;
  conflict_count: number;
  preview_id: string | null;
  status: 'connection_missing' | 'not_active_host' | 'ready' | 'source_mode_mismatch' | 'unavailable';
  unmatched_count: number;
}

export interface NativeReadwiseIdentityBindingResult {
  annotation_count: number;
  bound_count: number;
  status: 'bound' | 'connection_changed' | 'preview_expired' | 'unavailable';
}
