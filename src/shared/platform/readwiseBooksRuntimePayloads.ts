export interface RuntimeReadwiseBookInventoryItem {
  annotationStatus: 'has_highlights' | 'no_highlights';
  bodyState: 'loaded' | 'unloaded';
  bookKey: string;
  epubPath: string | null;
  epubStatus: 'received' | 'missing';
  fullDocumentMarkdownPath: string | null;
  generatedNodeId: string | null;
  highlightState: 'failed' | 'partial' | 'pending' | 'placed' | null;
  highlightMarkdownPath: string | null;
  highlightUnmatchedCount: number | null;
  importStatus: 'completed' | 'pending';
  nodeStatus: 'generated' | 'missing';
  title: string;
}

export interface RuntimeReadwiseBooksInventory {
  books: RuntimeReadwiseBookInventoryItem[];
  fullDocumentDirectoryPath: string;
  highlightDirectoryPath: string;
  scannedAt: string;
}

function isAnnotationStatus(value: unknown): value is RuntimeReadwiseBookInventoryItem['annotationStatus'] {
  return value === 'has_highlights' || value === 'no_highlights';
}

function isBodyState(value: unknown): value is RuntimeReadwiseBookInventoryItem['bodyState'] {
  return value === 'loaded' || value === 'unloaded';
}

function isEpubStatus(value: unknown): value is RuntimeReadwiseBookInventoryItem['epubStatus'] {
  return value === 'received' || value === 'missing';
}

function isHighlightState(value: unknown): value is NonNullable<RuntimeReadwiseBookInventoryItem['highlightState']> {
  return value === 'failed' || value === 'partial' || value === 'pending' || value === 'placed';
}

function isImportStatus(value: unknown): value is RuntimeReadwiseBookInventoryItem['importStatus'] {
  return value === 'completed' || value === 'pending';
}

function isNodeStatus(value: unknown): value is RuntimeReadwiseBookInventoryItem['nodeStatus'] {
  return value === 'generated' || value === 'missing';
}

function toRuntimeReadwiseBookInventoryItem(value: unknown): RuntimeReadwiseBookInventoryItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (
    !isAnnotationStatus(payload.annotation_status) ||
    !isBodyState(payload.body_state) ||
    typeof payload.book_key !== 'string' ||
    (payload.epub_path !== null && typeof payload.epub_path !== 'string') ||
    !isEpubStatus(payload.epub_status) ||
    (payload.full_document_markdown_path !== null && typeof payload.full_document_markdown_path !== 'string') ||
    (payload.generated_node_id !== null && typeof payload.generated_node_id !== 'string') ||
    (payload.highlight_state !== null && !isHighlightState(payload.highlight_state)) ||
    (payload.highlight_markdown_path !== null && typeof payload.highlight_markdown_path !== 'string') ||
    (payload.highlight_unmatched_count !== null && typeof payload.highlight_unmatched_count !== 'number') ||
    !isImportStatus(payload.import_status) ||
    !isNodeStatus(payload.node_status) ||
    typeof payload.title !== 'string'
  ) {
    return null;
  }
  return {
    annotationStatus: payload.annotation_status,
    bodyState: payload.body_state,
    bookKey: payload.book_key,
    epubPath: payload.epub_path,
    epubStatus: payload.epub_status,
    fullDocumentMarkdownPath: payload.full_document_markdown_path,
    generatedNodeId: payload.generated_node_id,
    highlightState: payload.highlight_state,
    highlightMarkdownPath: payload.highlight_markdown_path,
    highlightUnmatchedCount: payload.highlight_unmatched_count,
    importStatus: payload.import_status,
    nodeStatus: payload.node_status,
    title: payload.title
  };
}

export function toRuntimeReadwiseBooksInventory(value: unknown): RuntimeReadwiseBooksInventory | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (
    !Array.isArray(payload.books) ||
    typeof payload.full_document_directory_path !== 'string' ||
    typeof payload.highlight_directory_path !== 'string' ||
    typeof payload.scanned_at !== 'string'
  ) {
    return null;
  }
  const books = payload.books.map(toRuntimeReadwiseBookInventoryItem);
  if (books.some((book) => !book)) {
    return null;
  }
  return {
    books: books.filter((book): book is RuntimeReadwiseBookInventoryItem => Boolean(book)),
    fullDocumentDirectoryPath: payload.full_document_directory_path,
    highlightDirectoryPath: payload.highlight_directory_path,
    scannedAt: payload.scanned_at
  };
}
