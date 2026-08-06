import { ANDROID_COMPANION_ATTACHMENT_RESOURCE_QUERY_DEFINITIONS } from './androidCompanionAttachmentResourceQueryDefinitions.js';
import { ANDROID_COMPANION_MISSING_RESOURCE_READ_RULES } from './androidCompanionMissingResourceQueryDefinitions.js';
import {
  ANDROID_COMPANION_MUTATION_DEFINITIONS,
  ANDROID_COMPANION_RESOURCE_MUTATION_RULES
} from './androidCompanionMutationDefinitions.js';
import { ANDROID_COMPANION_RESOURCE_READ_RULES } from './androidCompanionResourceQueryDefinitions.js';
import { ANDROID_COMPANION_RESOURCE_STATUSES } from './androidCompanionSyncProtocolDefinitions.js';
import {
  COMPANION_RESOURCE_PLUGIN_DEFAULTS,
  COMPANION_RESOURCE_PLUGIN_REQUEST_KEYS
} from './companionResourcePluginContractDefinitions.js';

const attachmentRead = ANDROID_COMPANION_RESOURCE_READ_RULES.attachmentResources;
const missingRead = ANDROID_COMPANION_MISSING_RESOURCE_READ_RULES.attachmentResources;
const mutations = ANDROID_COMPANION_RESOURCE_MUTATION_RULES.attachmentResources;

export const COMPANION_ATTACHMENT_RESOURCE_HOST_CONTRACT_DEFINITIONS = {
  batchResponseKeys: attachmentRead.batchResponseKeys,
  defaultLimit: COMPANION_RESOURCE_PLUGIN_DEFAULTS.missingResourceLimit,
  directoryName: attachmentRead.directoryName,
  hashPattern: ANDROID_COMPANION_RESOURCE_READ_RULES.contentBlobCas.hashPattern,
  idFilterReplacement: attachmentRead.contentHashesReplacement,
  missingResultKeys: {
    resource: missingRead.emptyResultKey,
    resources: missingRead.resultKey
  },
  requestKeys: {
    attachmentId: COMPANION_RESOURCE_PLUGIN_REQUEST_KEYS.attachmentId,
    batchToken: COMPANION_RESOURCE_PLUGIN_REQUEST_KEYS.batchToken,
    committed: COMPANION_RESOURCE_PLUGIN_REQUEST_KEYS.committed,
    contentHash: COMPANION_RESOURCE_PLUGIN_REQUEST_KEYS.contentHash,
    headers: COMPANION_RESOURCE_PLUGIN_REQUEST_KEYS.headers,
    limit: COMPANION_RESOURCE_PLUGIN_REQUEST_KEYS.limit,
    resources: COMPANION_RESOURCE_PLUGIN_REQUEST_KEYS.resources,
    url: COMPANION_RESOURCE_PLUGIN_REQUEST_KEYS.url
  },
  resolveResponseKeys: attachmentRead.resolveResponseKeys,
  resolveStatuses: attachmentRead.resolveStatuses,
  statuses: {
    cached: ANDROID_COMPANION_RESOURCE_STATUSES.cached,
    failed: ANDROID_COMPANION_RESOURCE_STATUSES.failed
  },
  sql: {
    contentHashes: ANDROID_COMPANION_ATTACHMENT_RESOURCE_QUERY_DEFINITIONS.attachmentResourceContentHashesByIds.sql,
    markCached: ANDROID_COMPANION_MUTATION_DEFINITIONS[mutations.markCachedMutationName],
    markFailed: ANDROID_COMPANION_MUTATION_DEFINITIONS[mutations.markFailedMutationName],
    missingById: ANDROID_COMPANION_ATTACHMENT_RESOURCE_QUERY_DEFINITIONS.attachmentResourceMissingById.sql,
    missingRows: ANDROID_COMPANION_ATTACHMENT_RESOURCE_QUERY_DEFINITIONS.attachmentResourceMissingRows.sql,
    resolve: ANDROID_COMPANION_ATTACHMENT_RESOURCE_QUERY_DEFINITIONS.attachmentResourceResolve.sql
  }
} as const;
