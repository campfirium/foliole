export interface NativeWatchedFolderBinding {
  action_mode: 'delete' | 'keep';
  archive_path: string;
  binding_id: string;
  connected_device_id: string | null;
  connected_device_name: string | null;
  connected_platform: string | null;
  connection_status: 'connected' | 'needs-folder';
  created_at: string;
  highlight_mode: 'merged' | 'split';
  highlight_path: string;
  primary_path: string;
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
  current_device_id: string;
}
