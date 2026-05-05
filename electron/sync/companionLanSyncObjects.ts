import type http from 'node:http';

import { listSyncChangesAfterCursor } from '../../lib/core/database/syncState.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadSyncIndex } from '../database/syncIndex.js';
import { loadSyncObjects } from '../database/syncObjects.js';

export const SYNC_CHANGES_PATH = '/companion/sync-changes';
export const SYNC_INDEX_PATH = '/companion/sync-index';
export const SYNC_OBJECTS_PATH = '/companion/sync-objects';

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

function readCursor(parsedRequestUrl: URL) {
  const createdAt = parsedRequestUrl.searchParams.get('after_created_at')?.trim();
  const changeId = parsedRequestUrl.searchParams.get('after_change_id')?.trim();
  return createdAt && changeId ? { createdAt, changeId } : null;
}

function readLimit(parsedRequestUrl: URL) {
  const limit = Number(parsedRequestUrl.searchParams.get('limit') ?? 500);
  return Number.isFinite(limit) ? Math.max(1, Math.min(1000, Math.trunc(limit))) : 500;
}

export function buildSyncChangesPayload(parsedRequestUrl: URL) {
  const changes = listSyncChangesAfterCursor(
    openDatabaseConnection().driver,
    readCursor(parsedRequestUrl),
    readLimit(parsedRequestUrl)
  ).filter((change) => change.objectType !== 'node');
  return {
    changes: changes.map((change) => ({
      change_id: change.changeId,
      object_type: change.objectType,
      object_id: change.objectId,
      change_type: change.changeType,
      device_id: change.deviceId,
      content_hash: change.contentHash,
      payload_json: change.payloadJson,
      created_at: change.createdAt
    }))
  };
}

export function isSyncObjectEndpoint(request: http.IncomingMessage, parsedRequestUrl: URL) {
  return request.method === 'GET' && (
    parsedRequestUrl.pathname === SYNC_CHANGES_PATH ||
    parsedRequestUrl.pathname === SYNC_INDEX_PATH ||
    parsedRequestUrl.pathname === SYNC_OBJECTS_PATH
  );
}
