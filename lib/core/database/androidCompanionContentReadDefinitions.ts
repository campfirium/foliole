export const ANDROID_COMPANION_CONTENT_READ_RULES = {
  groupKeys: {
    externalDocuments: 'externalDocuments',
    readableArticle: 'readableArticle',
    topicSearch: 'topicSearch'
  },
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
      bodyBlobHash: 'body_blob_hash',
      content: 'content',
      contentStatus: 'content_status',
      documentId: 'document_id',
      excerpt: 'excerpt',
      matchStart: 'match_start'
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
      { outputKey: 'content', rowKey: 'content', type: 'nullableString' },
      { outputKey: 'content_status', rowKey: 'content_status', type: 'string' },
      { outputKey: 'updated_at', rowKey: 'updated_at', type: 'nullableString' }
    ],
    searchResultFields: [
      { outputKey: 'document_id', rowKey: 'document_id', type: 'nullableString' },
      { outputKey: 'folder_id', rowKey: 'folder_id', type: 'nullableString' },
      { outputKey: 'relative_path', rowKey: 'relative_path', type: 'nullableString' },
      { outputKey: 'file_name', rowKey: 'file_name', type: 'nullableString' },
      { outputKey: 'extension', rowKey: 'extension', type: 'nullableString' },
      { outputKey: 'title', rowKey: 'title', type: 'nullableString' },
      { outputKey: 'opening_text', rowKey: 'opening_text', type: 'nullableString' },
      { outputKey: 'content', rowKey: 'content', type: 'nullableString' },
      { outputKey: 'content_status', rowKey: 'content_status', type: 'string' },
      { outputKey: 'updated_at', rowKey: 'updated_at', type: 'nullableString' },
      { outputKey: 'match_start', rowKey: 'match_start', type: 'long' },
      { outputKey: 'excerpt', rowKey: 'excerpt', type: 'string' }
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
      bodyBlobHash: 'body_blob_hash',
      content: 'content',
      contentStatus: 'content_status',
      id: 'id',
      pdfAttachmentId: 'pdf_attachment_id',
      title: 'title'
    },
    outputKeys: {
      bodyBlobHash: 'body_blob_hash',
      content: 'content',
      contentStatus: 'content_status',
      nodeId: 'node_id',
      pdfAttachmentId: 'pdf_attachment_id',
      title: 'title'
    },
    articleFields: [
      { outputKey: 'node_id', rowKey: 'id', type: 'string' },
      { outputKey: 'title', rowKey: 'title', type: 'string' },
      { outputKey: 'body_blob_hash', rowKey: 'body_blob_hash', type: 'nullableString' },
      { outputKey: 'content', rowKey: 'content', type: 'nullableString' },
      { outputKey: 'content_status', rowKey: 'content_status', type: 'string' },
      { outputKey: 'pdf_attachment_id', rowKey: 'pdf_attachment_id', type: 'nullableString' }
    ]
  },
  topicSearch: {
    defaultSearchLimit: 20,
    excerptRadius: 80,
    maxSearchLimit: 100,
    resultKey: 'results',
    searchQueryName: 'topicSearch',
    outputKeys: {
      query: 'query',
      results: 'results'
    },
    searchResultFields: [
      { outputKey: 'node_id', rowKey: 'id', type: 'string' },
      { outputKey: 'title', rowKey: 'title', type: 'string' },
      { outputKey: 'opening_text', rowKey: 'opening_text', type: 'nullableString' },
      { outputKey: 'content_status', rowKey: 'content_status', type: 'string' },
      { outputKey: 'updated_at', rowKey: 'updated_at', type: 'string' },
      { outputKey: 'match_start', rowKey: 'match_start', type: 'long' },
      { outputKey: 'excerpt', rowKey: 'excerpt', type: 'string' }
    ]
  }
} as const;
