import type http from 'node:http';

import { flushDirtyNodeSyncVersions } from '../database/nodeSyncVersions.js';
import { loadSyncIndex } from '../database/syncIndex.js';
import { loadSyncNodeVersionsSince } from '../database/syncNodes.js';
import { loadSyncObjects, loadSyncStateObjectsSince } from '../database/syncObjects.js';
import { loadSyncReviewLogSince } from '../database/syncReviewLog.js';

export const SYNC_INDEX_PATH = '/companion/sync-index';
export const SYNC_NODE_VERSIONS_PATH = '/companion/sync-node-versions';
export const SYNC_OBJECTS_PATH = '/companion/sync-objects';
export const SYNC_REVIEW_LOG_PATH = '/companion/sync-review-log';
export const SYNC_STATE_PATH = '/companion/sync-state';

function readQueryValues(url: URL, key: string) {
  return [...new Set(url.searchParams.getAll(key).map((value) => value.trim()).filter(Boolean))];
}

export function buildSyncIndexPayload() {
  return {
    entries: loadSyncIndex()
  };
}

export function buildSyncObjectsPayload(parsedRequestUrl: URL) {
  return {
    objects: loadSyncObjects(
      readQueryValues(parsedRequestUrl, 'object_id'),
      readQueryValues(parsedRequestUrl, 'object_type')
    )
  };
}

function readLimit(parsedRequestUrl: URL) {
  const limit = Number(parsedRequestUrl.searchParams.get('limit') ?? 500);
  return Number.isFinite(limit) ? Math.max(1, Math.min(1000, Math.trunc(limit))) : 500;
}

function readStateSeqCursor(parsedRequestUrl: URL) {
  const cursor = Number(parsedRequestUrl.searchParams.get('after_state_seq') ?? 0);
  return Number.isFinite(cursor) ? Math.max(0, Math.trunc(cursor)) : 0;
}

function readEventCursor(parsedRequestUrl: URL) {
  const createdAt = parsedRequestUrl.searchParams.get('after_created_at')?.trim();
  const changeId = parsedRequestUrl.searchParams.get('after_change_id')?.trim();
  return createdAt && changeId ? { createdAt, changeId } : null;
}

export function buildSyncStatePayload(parsedRequestUrl: URL) {
  return {
    objects: loadSyncStateObjectsSince(
      readStateSeqCursor(parsedRequestUrl),
      readLimit(parsedRequestUrl)
    )
  };
}

export function buildSyncNodeVersionsPayload(parsedRequestUrl: URL) {
  const cursor = readEventCursor(parsedRequestUrl);
  flushDirtyNodeSyncVersions();
  return {
    nodes: loadSyncNodeVersionsSince(
      cursor ? { createdAt: cursor.createdAt, versionId: cursor.changeId } : null,
      readLimit(parsedRequestUrl)
    )
  };
}

export function buildSyncReviewLogPayload(parsedRequestUrl: URL) {
  const cursor = readEventCursor(parsedRequestUrl);
  return {
    reviews: loadSyncReviewLogSince(
      cursor ? { reviewedAt: cursor.createdAt, opId: cursor.changeId } : null,
      readLimit(parsedRequestUrl)
    )
  };
}

export function isSyncObjectEndpoint(request: http.IncomingMessage, parsedRequestUrl: URL) {
  return request.method === 'GET' && (
    parsedRequestUrl.pathname === SYNC_INDEX_PATH ||
    parsedRequestUrl.pathname === SYNC_NODE_VERSIONS_PATH ||
    parsedRequestUrl.pathname === SYNC_OBJECTS_PATH ||
    parsedRequestUrl.pathname === SYNC_REVIEW_LOG_PATH ||
    parsedRequestUrl.pathname === SYNC_STATE_PATH
  );
}
