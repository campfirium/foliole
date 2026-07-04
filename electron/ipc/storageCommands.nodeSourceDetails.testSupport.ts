export const NODE_SOURCE_DETAILS_RECORD = {
  importRuns: [
    {
      content_fingerprint: 'content-1',
      degraded_reason: null,
      duplicate_semantic: 'new',
      failure_reason: null,
      id: 'import-1',
      imported_at: '2026-03-26T10:00:00.000Z',
      node_id: 'node-1',
      provider: 'desktop_text_file',
      result_status: 'imported',
      source_fingerprint: 'source-1',
      source_kind: 'markdown',
      source_locator: '/tmp/note.md',
      source_name: 'note.md'
    }
  ],
  importSource: {
    first_imported_at: '2026-03-25T10:00:00.000Z',
    last_content_fingerprint: 'content-1',
    last_imported_at: '2026-03-26T10:00:00.000Z',
    latest_node_id: 'node-1',
    provider: 'desktop_text_file',
    source_fingerprint: 'source-1',
    source_kind: 'markdown',
    source_locator: '/tmp/note.md',
    source_name: 'note.md'
  },
  inheritedFromParent: true,
  keepImportItem: {
    first_seen_at: '2026-03-25T10:00:00.000Z',
    has_source_update: 1,
    last_imported_at: '2026-03-26T10:00:00.000Z',
    last_seen_at: '2026-03-26T10:05:00.000Z',
    last_status: 'imported',
    rule_id: 'draft-import-source-1',
    source_mtime_ms: 123,
    source_path: '/Users/me/Readwise/Full Document Contents/Articles/note.md',
    source_size_bytes: 456
  },
  pdfPageDimensions: [
    { page: 1, page_height: 1131, page_width: 800 },
    { page: 2, page_height: 1200, page_width: 820 }
  ],
  sourceNodeId: 'node-parent'
};

export const IMPORT_MANAGER_SETTINGS_RECORD = {
  readwiseReaderConfig: {},
  readwiseRootPath: '/Users/me/Readwise',
  readwiseSources: [
    {
      highlightMode: 'split',
      highlightPath: '/Users/me/Readwise/Articles',
      id: 'draft-import-source-1',
      keepPreview: null,
      keepState: 'enabled',
      kind: 'articles',
      primaryPath: '/Users/me/Readwise/Full Document Contents/Articles'
    }
  ],
  sources: [],
  updatedAt: '2026-03-26T00:00:00.000Z',
  version: 3
};

export const EXPECTED_NODE_SOURCE_PAYLOAD = {
  import_runs: [
    {
      content_fingerprint: 'content-1',
      degraded_reason: null,
      duplicate_semantic: 'new',
      failure_reason: null,
      import_id: 'import-1',
      imported_at: '2026-03-26T10:00:00.000Z',
      node_id: 'node-1',
      provider: 'desktop_text_file',
      result_status: 'imported',
      source_fingerprint: 'source-1',
      source_kind: 'markdown',
      source_locator: '/tmp/note.md',
      source_name: 'note.md'
    }
  ],
  import_source: {
    first_imported_at: '2026-03-25T10:00:00.000Z',
    last_content_fingerprint: 'content-1',
    last_imported_at: '2026-03-26T10:00:00.000Z',
    latest_node_id: 'node-1',
    provider: 'desktop_text_file',
    source_fingerprint: 'source-1',
    source_kind: 'markdown',
    source_locator: '/tmp/note.md',
    source_name: 'note.md'
  },
  inherited_from_parent: true,
  keep_import_item: {
    first_seen_at: '2026-03-25T10:00:00.000Z',
    has_source_update: true,
    highlight_path: '/Users/me/Readwise/Articles',
    keep_state: 'enabled',
    last_imported_at: '2026-03-26T10:00:00.000Z',
    last_seen_at: '2026-03-26T10:05:00.000Z',
    last_status: 'imported',
    primary_path: '/Users/me/Readwise/Full Document Contents/Articles',
    rule_id: 'draft-import-source-1',
    rule_label: 'Readwise articles',
    resolved_source_path: '/Users/me/Readwise/Full Document Contents/Articles/note.md',
    source_mtime_ms: 123,
    source_path: '/Users/me/Readwise/Full Document Contents/Articles/note.md',
    source_size_bytes: 456,
    source_type: 'readwise'
  },
  pdf_page_dimensions: [
    { page: 1, page_height: 1131, page_width: 800 },
    { page: 2, page_height: 1200, page_width: 820 }
  ],
  source_node_id: 'node-parent'
};
