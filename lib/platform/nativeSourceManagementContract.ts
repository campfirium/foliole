export type NativeSourceManagementAction = 'remove_source' | 'replace_host';

export type NativeSourceManagementType = 'external' | 'watched';

export interface NativeSourceManagementSummary {
  root_path: string;
  source_ref: string;
  source_type: NativeSourceManagementType;
  topic_count: number;
}

export interface NativeSourceManagementPreview {
  action: NativeSourceManagementAction;
  checked_at: string;
  current_host_name: string;
  source_count: number;
  sources: NativeSourceManagementSummary[];
  topic_count: number;
}

export interface NativeSourceManagementResult {
  action: NativeSourceManagementAction;
  changed_source_count: number;
  completed_at: string;
  topic_count: number;
}
