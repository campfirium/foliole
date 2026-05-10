export interface NativeReadwiseDetectionSample {
  excerpt: string;
  highlightText: string;
  matched: boolean;
  sourceName: string;
}

export interface NativeReadwiseDetectionResult {
  checkedSourceCount: number;
  detectedHighlightCount: number;
  matchedHighlightCount: number;
  message: string;
  sampleCount: number;
  samples: NativeReadwiseDetectionSample[];
  success: boolean;
}

export interface NativeReadwiseBookDownloadResult {
  book_key: string | null;
  status: 'book_not_found' | 'missing_link' | 'opened' | 'blocked_secondary';
  title: string | null;
  url: string | null;
}

export interface NativeReadwiseBookEpubProgressEvent {
  detail: string;
  node_id: string;
  phase: 'importing_epub' | 'placing_highlights' | 'completed' | 'failed';
  progress: number;
}

export interface NativeReadwiseBookEpubLoadResult {
  book_key: string | null;
  error_message?: string | null;
  epub_path: string | null;
  status: 'book_not_found' | 'cancelled' | 'selected' | 'failed' | 'blocked_secondary';
  title: string | null;
}

export interface NativeReadwiseBookImportResetResult {
  book_key: string | null;
  content: string | null;
  node_id: string | null;
  removed_node_ids: string[];
  status: 'book_not_found' | 'reset' | 'blocked_secondary';
  title: string | null;
  updated_at: string | null;
}

export interface NativeReadwiseBookInventoryItem {
  annotation_status: 'has_highlights' | 'no_highlights';
  book_key: string;
  epub_path: string | null;
  epub_status: 'received' | 'missing';
  full_document_markdown_path: string | null;
  generated_node_id: string | null;
  highlight_markdown_path: string | null;
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
