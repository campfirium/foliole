export const SYNC_INDEX_PATH = '/companion/sync-index';
export const SYNC_NODE_VERSIONS_PATH = '/companion/sync-node-versions';
export const SYNC_OBJECTS_PATH = '/companion/sync-objects';
export const SYNC_REVIEW_LOG_PATH = '/companion/sync-review-log';
export const SYNC_STATE_PATH = '/companion/sync-state';

const RETIRED_SYNC_JSON_ENDPOINT_PATHS = new Set([
  SYNC_INDEX_PATH,
  SYNC_NODE_VERSIONS_PATH,
  SYNC_OBJECTS_PATH,
  SYNC_REVIEW_LOG_PATH,
  SYNC_STATE_PATH
]);

export function isRetiredSyncJsonEndpoint(parsedRequestUrl: URL) {
  return RETIRED_SYNC_JSON_ENDPOINT_PATHS.has(parsedRequestUrl.pathname);
}
