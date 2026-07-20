import { ANDROID_COMPANION_CONTENT_RESOURCE_QUERY_DEFINITIONS } from './androidCompanionContentResourceQueryDefinitions.js';
import {
  ANDROID_COMPANION_MUTATION_DEFINITIONS,
  ANDROID_COMPANION_RESOURCE_MUTATION_RULES
} from './androidCompanionMutationDefinitions.js';
import {
  ANDROID_COMPANION_MISSING_RESOURCE_READ_RULES,
  ANDROID_COMPANION_RESOURCE_READ_RULES
} from './androidCompanionResourceQueryDefinitions.js';
import { ANDROID_COMPANION_RESOURCE_STATUSES } from './androidCompanionSyncProtocolDefinitions.js';
import {
  COMPANION_RESOURCE_PLUGIN_DEFAULTS,
  COMPANION_RESOURCE_PLUGIN_REQUEST_KEYS
} from './companionResourcePluginContractDefinitions.js';

const contentQueries = ANDROID_COMPANION_CONTENT_RESOURCE_QUERY_DEFINITIONS;
const contentRead = ANDROID_COMPANION_RESOURCE_READ_RULES.contentBlobs;
const missingRead = ANDROID_COMPANION_MISSING_RESOURCE_READ_RULES.contentBlobs;
const contentMutations = ANDROID_COMPANION_RESOURCE_MUTATION_RULES.contentBlobs;

export const COMPANION_CONTENT_BLOB_HOST_CONTRACT_DEFINITIONS = {
  batchResponseKeys: contentRead.batchResponseKeys,
  cas: ANDROID_COMPANION_RESOURCE_READ_RULES.contentBlobCas,
  defaultLimit: COMPANION_RESOURCE_PLUGIN_DEFAULTS.missingResourceLimit,
  hashesReplacement: contentRead.hashesReplacement,
  missingResultKeys: {
    blobs: missingRead.resultKey,
    failedBytes: missingRead.summaryKeys.failedBytes,
    failedCount: missingRead.summaryKeys.failedCount,
    hashes: missingRead.hashesResultKey,
    missingBytes: missingRead.summaryKeys.bytes,
    missingCount: missingRead.summaryKeys.count
  },
  requestKeys: {
    batchToken: COMPANION_RESOURCE_PLUGIN_REQUEST_KEYS.batchToken,
    body: COMPANION_RESOURCE_PLUGIN_REQUEST_KEYS.body,
    headers: COMPANION_RESOURCE_PLUGIN_REQUEST_KEYS.headers,
    limit: COMPANION_RESOURCE_PLUGIN_REQUEST_KEYS.limit,
    url: COMPANION_RESOURCE_PLUGIN_REQUEST_KEYS.url
  },
  responseHeaderKey: 'x-blob-hash',
  statuses: {
    cached: ANDROID_COMPANION_RESOURCE_STATUSES.cached,
    failed: ANDROID_COMPANION_RESOURCE_STATUSES.failed
  },
  sql: {
    dataReplace: ANDROID_COMPANION_MUTATION_DEFINITIONS[contentMutations.dataReplaceMutationName],
    manifests: contentQueries.contentBlobManifestsByHashes.sql,
    markCached: ANDROID_COMPANION_MUTATION_DEFINITIONS[contentMutations.markCachedMutationName],
    markFailed: ANDROID_COMPANION_MUTATION_DEFINITIONS[contentMutations.markFailedMutationName],
    missing: contentQueries.contentBlobMissingHashes.sql,
    missingSummary: contentQueries.contentBlobMissingSummaryRows.sql
  }
} as const;
