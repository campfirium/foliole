export interface NativeReadwiseDetectionSample {
  excerpt: string;
  highlightText: string;
  matched: boolean;
  sourceName: string;
}

export interface NativeReadwiseDetectionResult {
  checkedSourceCount: number;
  detectedHighlightCount: number;
  highlightOnlySourceCount: number;
  highlightedArticleCount: number;
  matchedHighlightCount: number;
  message: string;
  sampleCount: number;
  samples: NativeReadwiseDetectionSample[];
  success: boolean;
  totalArticleCount: number;
  unparsedHighlightFileCount: number;
}

export interface NativeReadwiseDetectionSource {
  articleDirectoryPath: string;
  fullDocumentDirectoryPath: string;
  label: string;
}

export interface NativeReadwiseBookDownloadResult {
  book_key: string | null;
  status: 'book_not_found' | 'missing_link' | 'opened' | 'source_inactive';
  title: string | null;
  url: string | null;
}

export interface NativeReadwiseBookEpubProgressEvent {
  detail: string;
  node_id: string;
  operation_id?: string;
  phase: 'getting_original' | 'downloading_epub' | 'reading_epub' |
    'locating_highlights' | 'saving' | 'importing_epub' | 'placing_highlights' | 'completed' | 'failed';
  progress: number;
}

export interface NativeReadwiseOriginalEpubActionState {
  node_id: string;
  status: 'not_applicable' | 'ready' | 'reconnect_required' | 'running' | 'source_inactive';
}

export interface NativeReadwiseOriginalEpubResult {
  error_code?: string | null;
  node_id: string;
  status: 'completed' | 'failed' | 'not_applicable' | 'source_inactive';
}

interface NativeReadwiseBookEpubLoadResultBase {
  book_key: string | null;
  error_message?: string | null;
  epub_path: string | null;
  title: string | null;
}

export type NativeReadwiseBookEpubLoadResult =
  | (NativeReadwiseBookEpubLoadResultBase & {
      annotation_status: 'has_highlights' | 'no_highlights';
      import_status: 'completed';
      status: 'selected';
    })
  | (NativeReadwiseBookEpubLoadResultBase & {
      status: 'book_not_found' | 'cancelled' | 'failed' | 'source_inactive';
    });

export interface NativeReadwiseBookImportResetResult {
  book_key: string | null;
  content: string | null;
  node_id: string | null;
  removed_node_ids: string[];
  status: 'book_not_found' | 'reset' | 'source_inactive';
  title: string | null;
  updated_at: string | null;
}

export interface NativeReadwiseBookInventoryItem {
  annotation_status: 'has_highlights' | 'no_highlights';
  body_state: 'loaded' | 'unloaded';
  book_key: string;
  epub_path: string | null;
  epub_status: 'received' | 'missing';
  full_document_markdown_path: string | null;
  generated_node_id: string | null;
  highlight_state: 'failed' | 'partial' | 'pending' | 'placed' | null;
  highlight_markdown_path: string | null;
  highlight_unmatched_count: number | null;
  import_status: 'completed' | 'pending';
  node_status: 'generated' | 'missing';
  title: string;
}

export interface NativeReadwiseBooksInventory {
  books: NativeReadwiseBookInventoryItem[];
  full_document_directory_path: string;
  highlight_directory_path: string;
  scanned_at: string;
}
