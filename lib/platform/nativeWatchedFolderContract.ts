export interface NativeWatchedFolderBinding {
  action_mode: 'delete' | 'keep';
  archive_path: string;
  binding_id: string;
  host_name: string;
  host_platform: string;
  connection_status: 'connected' | 'needs-folder';
  created_at: string;
  highlight_mode: 'merged' | 'split';
  highlight_path: string;
  primary_path: string;
  source_ref: string;
  updated_at: string;
}

export interface NativeWatchedFolderMatchPreview {
  binding: NativeWatchedFolderBinding;
  checked_at: string;
  folder_path: string;
  matched_count: number;
  missing_count: number;
  new_count: number;
}

export interface NativeWatchedFolderBindingsState {
  bindings: NativeWatchedFolderBinding[];
  current_host_name: string;
}
