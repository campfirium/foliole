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
  editable?: boolean;
  extension: 'md' | 'txt';
  file_name: string;
  file_size?: number | null;
  folder_id: string;
  folder_path: string;
  imported_node_id?: string | null;
  is_present?: boolean;
  last_opened_at?: string | null;
  modified_at?: string | null;
  relative_path: string;
  source_kind?: 'external_document' | 'local_file';
}

export interface NativeExternalSearchBrowseEntry {
  absolute_path: string;
  editable?: boolean;
  extension: 'md' | 'txt';
  file_name: string;
  file_size?: number | null;
  folder_id: string;
  folder_path: string;
  imported_node_id?: string | null;
  is_present?: boolean;
  last_opened_at?: string | null;
  modified_at: string;
  opening_text: string | null;
  relative_path: string;
  source_kind?: 'external_document' | 'local_file';
  title: string;
}
