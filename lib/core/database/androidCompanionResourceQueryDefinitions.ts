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
    batchResponseKeys: {
      databaseElapsedMs: 'db_elapsed_ms',
      httpElapsedMs: 'http_elapsed_ms',
      parseElapsedMs: 'parse_elapsed_ms',
      syncedHashes: 'synced_hashes',
      totalElapsedMs: 'total_elapsed_ms'
    },
    manifestTableName: 'content_blobs',
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
    deletedAtRowKey: 'deleted_at',
    nodeIdRowKey: 'id',
    metaValueQueryName: 'workspaceMetaValue',
    metaValueResultKey: 'rows',
    nodesQueryName: 'workspaceSnapshotNodes',
    nodesResultKey: 'nodes',
    orderedNodeIdsQueryName: 'workspaceOrderedNodeIds',
    orderedNodeIdsResultKey: 'nodes',
    outputKeys: {
      activeNodeId: 'activeNodeId',
      nodeOrder: 'nodeOrder',
      nodesById: 'nodesById',
      persistedNodeViewById: 'persistedNodeViewById',
      trashedNodeIds: 'trashedNodeIds',
      untitledSequenceByParent: 'untitledSequenceByParent'
    },
    nodePayload: {
      validKinds: ['folder', 'item', 'topic'],
      defaultKind: 'topic',
      defaultTitle: 'Untitled',
      bodyStatusRowKey: 'body_status',
      bodyStatusOutputKey: 'bodyStatus',
      visibleBodyStatusGroup: 'visibleBodyStatuses',
      attachmentsOutputKey: 'attachments',
      fields: [
        { outputKey: 'id', rowKey: 'id', type: 'string' },
        { outputKey: 'parentNodeId', rowKey: 'parent_id', type: 'nullableString' },
        { outputKey: 'kind', rowKey: 'kind', type: 'kind' },
        { outputKey: 'priority', rowKey: 'priority', type: 'long', omitWhenNull: true },
        { outputKey: 'desiredRetention', rowKey: 'desired_retention', type: 'double', omitWhenNull: true },
        { outputKey: 'title', rowKey: 'title', type: 'title' },
        { outputKey: 'isTitleManual', rowKey: 'is_title_manual', type: 'booleanLong' },
        { outputKey: 'hideTitleHeading', rowKey: 'hide_title_heading', type: 'booleanLong' },
        { outputKey: 'content', rowKey: 'content', type: 'nullableString' },
        { outputKey: 'bodyBlobHash', rowKey: 'body_blob_hash', type: 'nullableString' },
        { outputKey: 'openingText', rowKey: 'opening_text', type: 'nullableString' },
        { outputKey: 'virtualFilter', rowKey: 'virtual_filter', type: 'json' },
        { outputKey: 'reveal', rowKey: 'reveal', type: 'nullableString' },
        { outputKey: 'anchorLink', rowKey: 'anchor_link', type: 'json' },
        { outputKey: 'imageRegions', rowKey: 'image_regions', type: 'json' },
        { outputKey: 'createdAt', rowKey: 'created_at', type: 'string' },
        { outputKey: 'updatedAt', rowKey: 'updated_at', type: 'string' },
        { outputKey: 'currentVersionId', rowKey: 'current_version_id', type: 'nullableString' }
      ],
      deletedAtField: { outputKey: 'deletedAt', rowKey: 'deleted_at', type: 'nullableString', omitWhenNull: true }
    },
    readingPayload: {
      outputKey: 'reading',
      requiredRowKeys: ['last_handled_at', 'next_at', 'reading_state'],
      stateRowKey: 'reading_state',
      validStates: ['active', 'done', 'dismissed'],
      fields: [
        { outputKey: 'intervalDurationMs', rowKey: 'interval_duration_ms', type: 'long', defaultValue: 0 },
        { outputKey: 'intervalGrowthFactor', rowKey: 'interval_growth_factor', type: 'double', defaultValue: 1 },
        { outputKey: 'lastHandledAt', rowKey: 'last_handled_at', type: 'nullableString' },
        { outputKey: 'nextAt', rowKey: 'next_at', type: 'nullableString' },
        { outputKey: 'priority', rowKey: 'reading_priority', type: 'double', defaultValue: 0 },
        { outputKey: 'readingPosition', rowKey: 'reading_position', type: 'long', defaultValue: 0 },
        { outputKey: 'repetitionCount', rowKey: 'repetition_count', type: 'long', defaultValue: 0 },
        { outputKey: 'state', rowKey: 'reading_state', type: 'nullableString' }
      ]
    },
    reviewPayload: {
      outputKey: 'review',
      requiredRowKeys: ['due'],
      fields: [
        { outputKey: 'due', rowKey: 'due', type: 'nullableString' },
        { outputKey: 'lastReviewAt', rowKey: 'last_review_at', type: 'nullableString' },
        { outputKey: 'state', rowKey: 'review_state', type: 'long', defaultValue: 0 },
        { outputKey: 'stability', rowKey: 'stability', type: 'double', defaultValue: 0 },
        { outputKey: 'difficulty', rowKey: 'difficulty', type: 'double', defaultValue: 0 },
        { outputKey: 'elapsedDays', rowKey: 'elapsed_days', type: 'long', defaultValue: 0 },
        { outputKey: 'scheduledDays', rowKey: 'scheduled_days', type: 'long', defaultValue: 0 },
        { outputKey: 'reps', rowKey: 'reps', type: 'long', defaultValue: 0 },
        { outputKey: 'lapses', rowKey: 'lapses', type: 'long', defaultValue: 0 }
      ]
    },
    untitledSequenceMetaKey: 'untitled_sequence_by_parent'
  },
  viewState: {
    defaultSource: 'user-scroll',
    nodeIdRowKey: 'node_id',
    queryName: 'nodeViewStatesByDevice',
    resultKey: 'states',
    fields: [
      { outputKey: 'nodeId', rowKey: 'node_id', type: 'string' },
      { outputKey: 'scrollTop', rowKey: 'scroll_top', type: 'nonNegativeLong' },
      { outputKey: 'selectionFrom', rowKey: 'selection_from', type: 'nullableNonNegativeLong' },
      { outputKey: 'selectionTo', rowKey: 'selection_to', type: 'nullableNonNegativeLong' },
      { outputKey: 'updatedAt', rowKey: 'updated_at', type: 'string' },
      { outputKey: 'source', rowKey: 'source', type: 'defaultedString', defaultRuleKey: 'defaultSource' }
    ]
  }
} as const;
