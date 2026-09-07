export type NativeReadwiseImportCancelResult = { status: 'cancelled' | 'idle' };
export type NativeReadwiseReconcileCancelResult = NativeReadwiseImportCancelResult;

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
