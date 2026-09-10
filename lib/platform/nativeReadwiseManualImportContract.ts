export interface NativeReadwiseManualSource {
  id: string;
  title: string;
  author: string | null;
  kind: 'article' | 'book';
  status: 'available' | 'imported' | 'deleted' | 'suppressed';
}

export interface NativeReadwiseManualSearchResult {
  status: 'ready' | 'preparing' | 'unavailable';
  sources: NativeReadwiseManualSource[];
}

export interface NativeReadwiseManualImportResult {
  status: 'imported' | 'suppressed' | 'reimport_required';
  node_id: string | null;
}
