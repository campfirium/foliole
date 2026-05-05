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
