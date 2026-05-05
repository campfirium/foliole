export type NativeExternalSearchAttachmentMode =
  | 'document_relative'
  | 'document_relative_first_then_fixed_root'
  | 'fixed_root';

export interface NativeExternalSearchFolder {
  attachment_mode: NativeExternalSearchAttachmentMode;
  attachment_root_path: string | null;
  created_at: string;
  document_count: number;
  excluded_dirs: string[];
  folder_path: string;
  id: string;
  indexed_at: string | null;
  last_error: string | null;
  status: 'error' | 'idle' | 'indexing' | 'ready';
  updated_at: string;
}

export interface NativeExternalSearchPreview {
  absolute_path: string;
  content: string;
  extension: 'md' | 'txt';
  file_name: string;
  folder_id: string;
  folder_path: string;
  relative_path: string;
}
