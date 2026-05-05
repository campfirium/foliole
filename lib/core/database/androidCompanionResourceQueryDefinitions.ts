import { ANDROID_COMPANION_ATTACHMENT_RESOURCE_QUERY_DEFINITIONS } from './androidCompanionAttachmentResourceQueryDefinitions.ts';
import { ANDROID_COMPANION_CONTENT_READ_RULES } from './androidCompanionContentReadDefinitions.ts';
import { ANDROID_COMPANION_CONTENT_RESOURCE_QUERY_DEFINITIONS } from './androidCompanionContentResourceQueryDefinitions.ts';
import { ANDROID_COMPANION_DOCUMENT_RESOURCE_QUERY_DEFINITIONS } from './androidCompanionDocumentResourceQueryDefinitions.ts';
import { ANDROID_COMPANION_MISSING_RESOURCE_READ_RULES } from './androidCompanionMissingResourceQueryDefinitions.ts';
import { ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS } from './androidCompanionNodeResourceQueryDefinitions.ts';

export const ANDROID_COMPANION_RESOURCE_QUERY_DEFINITIONS = {
  ...ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS,
  ...ANDROID_COMPANION_CONTENT_RESOURCE_QUERY_DEFINITIONS,
  ...ANDROID_COMPANION_ATTACHMENT_RESOURCE_QUERY_DEFINITIONS,
  ...ANDROID_COMPANION_DOCUMENT_RESOURCE_QUERY_DEFINITIONS
};

export { ANDROID_COMPANION_MISSING_RESOURCE_READ_RULES };

export { ANDROID_COMPANION_CONTENT_READ_RULES };

export { ANDROID_COMPANION_WORKSPACE_READ_RULES } from './androidCompanionWorkspaceReadDefinitions.ts';

export const ANDROID_COMPANION_NODE_ATTACHMENT_READ_RULES = {
  groupKeys: {
    backfillSnapshots: 'backfillSnapshots',
    nodeAttachments: 'nodeAttachments'
  },
  backfillSnapshots: {
    attachmentIdKey: 'attachment_id',
    attachmentsKey: 'attachments',
    idKey: 'id',
    queryName: 'nodeAttachmentBackfillSnapshots',
    roleKey: 'role',
    resultKey: 'snapshots',
    snapshotJsonKey: 'snapshot_json'
  },
  nodeAttachments: {
    queryName: 'nodeAttachments',
    resultKey: 'attachments'
  }
} as const;

export const ANDROID_COMPANION_RESOURCE_READ_RULES = {
  groupKeys: {
    attachmentResources: 'attachmentResources',
    contentBlobs: 'contentBlobs',
    pdfPageText: 'pdfPageText'
  },
  attachmentResources: {
    attachmentIdKey: 'attachment_id',
    contentHashKey: 'content_hash',
    contentHashesByIdsQueryName: 'attachmentResourceContentHashesByIds',
    contentHashesReplacement: '__ATTACHMENT_ID_FILTER__',
    directoryName: 'attachments',
    mimeTypeKey: 'mime_type',
    batchResponseKeys: {
      syncedAttachmentIds: 'synced_attachment_ids'
    },
    resolveResponseKeys: {
      mimeType: 'mime_type',
      resourceUrl: 'resource_url',
      status: 'status'
    },
    resolveStatuses: {
      missingFile: 'missing_file',
      notFound: 'not_found',
      readyStatusKey: 'ready'
    },
    resolveQueryName: 'attachmentResourceResolve',
    resultKey: 'resources',
    storageKey: 'storage_key',
    syncRequestKeys: {
      attachmentId: 'attachment_id',
      contentHash: 'content_hash',
      headers: 'headers',
      url: 'url'
    },
    syncResponseKeys: {
      attachmentId: 'attachment_id',
      availability: 'availability'
    }
  },
  contentBlobs: {
    compressionKey: 'compression',
    dataTableName: 'content_blob_data',
    existingQueryName: 'contentBlobDataExisting',
    hashKey: 'hash',
    hashesReplacement: '__HASH_FILTER__',
    batchResponseKeys: {
      databaseElapsedMs: 'db_elapsed_ms',
      httpElapsedMs: 'http_elapsed_ms',
      parseElapsedMs: 'parse_elapsed_ms',
      syncedHashes: 'synced_hashes',
      totalElapsedMs: 'total_elapsed_ms'
    },
    manifestTableName: 'content_blobs',
    manifestsByHashesQueryName: 'contentBlobManifestsByHashes',
    manifestQueryName: 'contentBlobManifestByHash',
    originalSha256Key: 'original_sha256',
    originalSizeBytesKey: 'original_size_bytes',
    syncResponseKeys: {
      availability: 'availability',
      hash: 'hash'
    },
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
    outputKeys: {
      excerpt: 'excerpt',
      matchStart: 'match_start',
      query: 'query'
    },
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
