export type NativeExternalSearchAttachmentMode =
  | 'document_relative'
  | 'document_relative_first_then_fixed_root'
  | 'fixed_root';

export interface NativeExternalSearchFolder {
  access_mode?: 'local' | 'remote_mirror';
  attachment_mode: NativeExternalSearchAttachmentMode;
  attachment_root_path: string | null;
  created_at: string;
  document_count: number;
  excluded_dirs: string[];
  folder_path: string;
  id: string;
  indexed_at: string | null;
  last_error: string | null;
  mirror_enabled?: boolean;
  source_executable?: boolean;
  source_host_name?: string;
  source_host_platform?: string;
  source_ref?: string;
  status: 'error' | 'idle' | 'indexing' | 'ready';
  updated_at: string;
}

export interface NativeExternalSearchReconnectPreview {
  checked_at: string;
  folder_id: string;
  folder_path: string;
  matched_count: number;
  missing_count: number;
  new_count: number;
}

export type NativeExternalDocumentReference =
  | { absolute_path: string; kind: 'local_path' }
  | { document_id: string; kind: 'mirror_document' };

interface NativeExternalSearchPreviewBase {
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

export type NativeExternalSearchPreview = NativeExternalSearchPreviewBase & (
  | { absolute_path: string; document_id?: never; reference: { absolute_path: string; kind: 'local_path' } }
  | { absolute_path?: never; document_id: string; reference: { document_id: string; kind: 'mirror_document' } }
);

interface NativeExternalSearchBrowseEntryBase {
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

export type NativeExternalSearchBrowseEntry = NativeExternalSearchBrowseEntryBase & (
  | { absolute_path: string; document_id?: never; reference: { absolute_path: string; kind: 'local_path' } }
  | { absolute_path?: never; document_id: string; reference: { document_id: string; kind: 'mirror_document' } }
);
