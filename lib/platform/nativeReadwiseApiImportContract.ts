export type NativeReadwiseImportCancelResult = { status: 'cancelled' | 'idle' };
export type NativeReadwiseReconcileCancelResult = NativeReadwiseImportCancelResult;

export type NativeReadwiseApiRunTrigger = 'manual' | 'scheduled' | 'startup';
export type NativeReadwiseApiRunStage = 'eligibility' | 'fetching' | 'writing' | 'completion';

export interface NativeReadwiseApiScheduleResult {
  completed_at: string;
  error_stage: NativeReadwiseApiRunStage | null;
  imported_count: number;
  status: 'cancelled' | 'completed' | 'failed' | 'paused';
  trigger: NativeReadwiseApiRunTrigger;
}

export interface NativeReadwiseApiScheduleStatus {
  eligibility: 'connection_required' | 'inactive_host' | 'ready' | 'source_mode_mismatch';
  initial_import: {
    completed_count: number;
    status: 'completed' | 'pending';
    total_count: number | null;
  };
  last_result: NativeReadwiseApiScheduleResult | null;
  next_run_at: string | null;
  running: boolean;
}

export interface NativeReadwiseReconcileResult {
  export_deleted_count: number;
  present_count: number;
  reader_missing_count: number;
  reconciled_at: string | null;
  status: 'cancelled' | 'completed' | 'failed';
  unconfirmed_count: number;
}
export type NativeReadwiseSyncPreviewDestination = 'external' | 'inbox' | 'off';

export interface NativeReadwiseOriginalFileResult {
  attachment_id: string | null;
  reason: string | null;
  status: 'html_only' | 'localized' | 'unavailable';
}

export interface NativeReadwiseApiPreviewFields {
  batch_count?: number;
  degraded_count?: number;
  estimated_seconds?: number;
  mode?: 'api' | 'folder';
  remaining_count?: number;
  unmatched_annotation_count?: number;
}

export interface NativeReadwiseApiRunFields {
  annotation_count?: number;
  committed_count?: number;
  remaining_count?: number;
}
