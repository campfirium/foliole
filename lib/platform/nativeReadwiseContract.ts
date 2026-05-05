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
  status: 'book_not_found' | 'missing_link' | 'opened';
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
  status: 'book_not_found' | 'cancelled' | 'selected' | 'failed';
  title: string | null;
}
