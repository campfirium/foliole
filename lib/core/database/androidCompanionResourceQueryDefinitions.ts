import { ANDROID_COMPANION_ATTACHMENT_RESOURCE_QUERY_DEFINITIONS } from './androidCompanionAttachmentResourceQueryDefinitions.ts';
import { ANDROID_COMPANION_CONTENT_RESOURCE_QUERY_DEFINITIONS } from './androidCompanionContentResourceQueryDefinitions.ts';
import { ANDROID_COMPANION_DOCUMENT_RESOURCE_QUERY_DEFINITIONS } from './androidCompanionDocumentResourceQueryDefinitions.ts';
import { ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS } from './androidCompanionNodeResourceQueryDefinitions.ts';

export const ANDROID_COMPANION_RESOURCE_QUERY_DEFINITIONS = {
  ...ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS,
  ...ANDROID_COMPANION_CONTENT_RESOURCE_QUERY_DEFINITIONS,
  ...ANDROID_COMPANION_ATTACHMENT_RESOURCE_QUERY_DEFINITIONS,
  ...ANDROID_COMPANION_DOCUMENT_RESOURCE_QUERY_DEFINITIONS
};

export const ANDROID_COMPANION_MISSING_RESOURCE_READ_RULES = {
  attachmentResources: {
    byIdQueryName: 'attachmentResourceMissingById',
    emptyResultKey: 'resource',
    minLimit: 1,
    resultKey: 'resources',
    rowsQueryName: 'attachmentResourceMissingRows',
    summaryQueryName: 'attachmentResourceMissingSummaryRows'
  },
  contentBlobs: {
    hashKey: 'hash',
    hashesResultKey: 'hashes',
    hashesQueryName: 'contentBlobMissingHashes',
    minLimit: 1,
    resultKey: 'blobs',
    summaryQueryName: 'contentBlobMissingSummaryRows'
  }
} as const;

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
    searchResultsKey: 'results'
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
    untitledTitle: 'Untitled'
  }
} as const;

export const ANDROID_COMPANION_NODE_ATTACHMENT_READ_RULES = {
  backfillSnapshots: {
    idKey: 'id',
    queryName: 'nodeAttachmentBackfillSnapshots',
    resultKey: 'snapshots',
    snapshotJsonKey: 'snapshot_json'
  },
  nodeAttachments: {
    queryName: 'nodeAttachments',
    resultKey: 'attachments'
  }
} as const;

export const ANDROID_COMPANION_RESOURCE_READ_RULES = {
  attachmentResources: {
    attachmentIdKey: 'attachment_id',
    contentHashKey: 'content_hash',
    contentHashesByIdsQueryName: 'attachmentResourceContentHashesByIds',
    contentHashesReplacement: '__ATTACHMENT_ID_FILTER__',
    mimeTypeKey: 'mime_type',
    resolveQueryName: 'attachmentResourceResolve',
    resultKey: 'resources',
    storageKey: 'storage_key'
  },
  contentBlobs: {
    compressionKey: 'compression',
    existingQueryName: 'contentBlobDataExisting',
    manifestQueryName: 'contentBlobManifestByHash',
    originalSha256Key: 'original_sha256',
    originalSizeBytesKey: 'original_size_bytes',
    resultKey: 'blobs',
    storedSha256Key: 'stored_sha256',
    storedSizeBytesKey: 'stored_size_bytes'
  },
  pdfPageText: {
    attachmentIdKey: 'attachment_id',
    defaultSearchLimit: 20,
    excerptRadius: 80,
    matchIndexKey: 'match_index',
    maxSearchLimit: 100,
    pageHeightKey: 'page_height',
    pageKey: 'page',
    pagesQueryName: 'pdfPageTextPages',
    pagesResultKey: 'pages',
    pageWidthKey: 'page_width',
    searchQueryName: 'pdfPageTextSearch',
    searchResultKey: 'results',
    textKey: 'text'
  }
} as const;

export const ANDROID_COMPANION_WORKSPACE_READ_RULES = {
  snapshot: {
    bodyStatusExpressionToken: '__BODY_STATUS_EXPRESSION__',
    contentBlobJoinToken: '__CONTENT_BLOB_JOIN__',
    contentExpressionToken: '__CONTENT_EXPRESSION__',
    metaValueQueryName: 'workspaceMetaValue',
    metaValueResultKey: 'rows',
    nodesQueryName: 'workspaceSnapshotNodes',
    nodesResultKey: 'nodes',
    orderedNodeIdsQueryName: 'workspaceOrderedNodeIds',
    orderedNodeIdsResultKey: 'nodes',
    untitledSequenceMetaKey: 'untitled_sequence_by_parent'
  },
  viewState: {
    defaultSource: 'user-scroll',
    queryName: 'nodeViewStatesByDevice',
    resultKey: 'states'
  }
} as const;
