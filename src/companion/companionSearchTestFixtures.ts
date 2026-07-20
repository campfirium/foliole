export function createCompanionSearchResultsFixture() {
  return {
    external: [{
      bodyStatus: 'ready' as const,
      content: '# External Alpha\n\nExternal search-opened body',
      document_id: 'doc-1',
      excerpt: 'External alpha excerpt',
      extension: '.md',
      file_name: 'external.md',
      folder_id: 'folder-1',
      match_start: 9,
      opening_text: 'External opening',
      relative_path: 'notes/external.md',
      title: 'External Alpha',
      updated_at: '2026-06-15T08:00:00.000Z'
    }],
    pdf: [{
      attachment_id: 'attachment-1',
      excerpt: 'PDF alpha excerpt',
      match_start: 4,
      page: 2,
      page_height: null,
      page_width: null,
      text: 'PDF alpha text'
    }],
    strategy: 'word-based' as const,
    topics: [{
      bodyStatus: 'ready' as const,
      excerpt: 'Topic alpha excerpt',
      matchStart: 1,
      nodeId: 'topic-1',
      openingText: 'Topic opening',
      title: 'Topic Alpha',
      updatedAt: '2026-06-15T08:00:00.000Z'
    }]
  };
}
