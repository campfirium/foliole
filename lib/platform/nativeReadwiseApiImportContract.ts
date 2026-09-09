export type NativeReadwiseImportCancelResult = { status: 'cancelled' | 'idle' };
export type NativeReadwiseReconcileCancelResult = NativeReadwiseImportCancelResult;

export type NativeReadwiseApiRunTrigger = 'manual' | 'scheduled' | 'startup';
export type NativeReadwiseApiRunStage = 'eligibility' | 'fetching' | 'writing' | 'completion';
export type NativeReadwiseApiRunKind = 'initial' | 'routine';
export type NativeReadwiseApiRunStatus = 'completed' | 'failed' | 'interrupted' | 'queued' | 'running';

export interface NativeReadwiseApiRunLifecycle {
  error_reason: string | null;
  finished_at: string | null;
  kind: NativeReadwiseApiRunKind;
  progress: NativeReadwiseApiTaskProgress | null;
  queued_at: string;
  run_id: string;
  stage: NativeReadwiseApiRunStage;
  started_at: string | null;
  status: NativeReadwiseApiRunStatus;
  trigger: NativeReadwiseApiRunTrigger;
}

export interface NativeReadwiseApiTaskProgress {
  completed_count: number;
  failed_count: number;
  pending_count: number;
  total_count: number | null;
  unexplained_failure_count: number;
}

export interface NativeReadwiseApiScheduleResult {
  completed_at: string;
  error_stage: NativeReadwiseApiRunStage | null;
  imported_count: number;
  status: 'cancelled' | 'completed' | 'failed' | 'paused';
  trigger: NativeReadwiseApiRunTrigger;
}

export interface NativeReadwiseApiScheduleStatus {
  cutover: NativeReadwiseApiTaskProgress & {
    status: 'completed' | 'in_progress' | 'not_started';
  };
  eligibility: 'connection_required' | 'inactive_host' | 'ready' | 'source_mode_mismatch';
  initial_sync: NativeReadwiseApiTaskProgress & {
    lifecycle: NativeReadwiseApiRunLifecycle | null;
    status: 'completed' | 'failed' | 'interrupted' | 'pending' | 'queued' | 'running';
  };
  routine_sync: {
    last_result: NativeReadwiseApiScheduleResult | null;
    lifecycle: NativeReadwiseApiRunLifecycle | null;
    next_run_at: string | null;
  };
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
