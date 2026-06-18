export interface ExportArgs {
  dbPath: string;
  outputPath: string;
  rootId?: string;
  rootTitle?: string;
  sourceLocale?: string;
}

export interface NodeRow {
  anchor_link: string | null;
  body_blob_data: Uint8Array | string | null;
  content: string;
  created_at: string;
  id: string;
  kind: string;
  manual_child_order: string | null;
  opening_text: string | null;
  parent_id: string | null;
  reveal: string | null;
  title: string;
}

export interface WarningRow {
  id: string;
  reason: 'shelved' | 'virtual';
  title: string;
}
