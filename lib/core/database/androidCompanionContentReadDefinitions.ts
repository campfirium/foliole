export const ANDROID_COMPANION_CONTENT_READ_RULES = {
  externalDocuments: {
    byIdQueryName: 'externalDocumentById',
    defaultSearchLimit: 20,
    directoryEntriesQueryName: 'externalDocumentDirectoryEntries',
    directoryEntriesResultKey: 'entries',
    documentResultKey: 'document',
    documentsResultKey: 'documents',
    excerptRadius: 80,
    foldersQueryName: 'externalSearchFolders',
    foldersResultKey: 'folders',
    maxSearchLimit: 100,
    searchQueryName: 'externalDocumentSearch',
    searchResultsKey: 'results',
    outputKeys: {
      absolutePath: 'absolute_path',
      document: 'document',
      entries: 'entries',
      excerpt: 'excerpt',
      matchStart: 'match_start',
      query: 'query',
      results: 'results'
    },
    rowKeys: {
      availability: 'availability',
      bodyBlobData: 'body_blob_data',
      bodyBlobHash: 'body_blob_hash',
      content: 'content',
      documentId: 'document_id',
      matchIndex: 'match_index'
    },
    directoryEntryFields: [
      { outputKey: 'document_id', rowKey: 'document_id', type: 'nullableString' },
      { outputKey: 'folder_id', rowKey: 'folder_id', type: 'nullableString' },
      { outputKey: 'relative_path', rowKey: 'relative_path', type: 'nullableString' },
      { outputKey: 'file_name', rowKey: 'file_name', type: 'nullableString' },
      { outputKey: 'extension', rowKey: 'extension', type: 'nullableString' },
      { outputKey: 'title', rowKey: 'title', type: 'nullableString' },
      { outputKey: 'opening_text', rowKey: 'opening_text', type: 'nullableString' },
      { outputKey: 'modified_at', rowKey: 'modified_at', type: 'nullableString' }
    ],
    documentFields: [
      { outputKey: 'document_id', rowKey: 'document_id', type: 'nullableString' },
      { outputKey: 'folder_id', rowKey: 'folder_id', type: 'nullableString' },
      { outputKey: 'relative_path', rowKey: 'relative_path', type: 'nullableString' },
      { outputKey: 'file_name', rowKey: 'file_name', type: 'nullableString' },
      { outputKey: 'extension', rowKey: 'extension', type: 'nullableString' },
      { outputKey: 'title', rowKey: 'title', type: 'nullableString' },
      { outputKey: 'opening_text', rowKey: 'opening_text', type: 'nullableString' },
      { outputKey: 'content', rowKey: 'content', type: 'resolvedContent' },
      { outputKey: 'content_status', rowKey: 'availability', type: 'contentStatus' },
      { outputKey: 'updated_at', rowKey: 'updated_at', type: 'nullableString' }
    ]
  },
  readableArticle: {
    activeNodeIdQueryName: 'readableArticleActiveNodeId',
    articleResultKey: 'readable_article',
    articlesResultKey: 'articles',
    byNodeIdQueryName: 'readableArticleByNodeId',
    firstNodeQueryName: 'readableArticleFirstNode',
    pdfPagesQueryName: 'pdfPageTextPages',
    pdfPagesResultKey: 'pages',
    pdfPlaceholderText: 'Linked PDF source ready for the reader surface.',
    referencePdfAttachmentQueryName: 'readableArticleReferencePdfAttachment',
    untitledTitle: 'Untitled',
    rowKeys: {
      availability: 'availability',
      bodyBlobData: 'body_blob_data',
      bodyBlobHash: 'body_blob_hash',
      content: 'content',
      id: 'id',
      title: 'title'
    },
    outputKeys: {
      bodyBlobHash: 'body_blob_hash',
      content: 'content',
      contentStatus: 'content_status',
      nodeId: 'node_id',
      pdfAttachmentId: 'pdf_attachment_id',
      title: 'title'
    }
  }
} as const;
