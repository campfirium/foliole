export type NativeReadwiseImportCancelResult = { status: 'cancelled' | 'idle' };
export type NativeReadwiseSyncPreviewDestination = 'external' | 'inbox' | 'off';

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
