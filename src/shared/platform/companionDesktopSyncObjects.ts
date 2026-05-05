import type {
  NativeSyncChangeCursor,
  NativeSyncNodeRecord,
  NativeSyncObjectRecord,
  NativeSyncReviewLogRecord
} from '../../../lib/platform/nativeSyncContract';

import { syncCompanionAttachmentResourcesFromDesktop } from './companionDesktopAttachmentResources';
import { fetchDesktopJson, postDesktopJson } from './companionDesktopSyncHttp';
import { createSignedRequestHeaders } from './companionWorkspacePairing';
import {
  applyCompanionDesktopSyncPack,
  applyCompanionSyncNodeVersions,
  applyCompanionSyncObjects,
  applyCompanionSyncReviewLog,
  loadCompanionSyncPackCursor,
  loadCompanionSyncNodeVersionCursor,
  loadCompanionSyncNodeVersionPushCursor,
  loadCompanionSyncNodeVersions,
  loadCompanionSyncReviewLogCursor,
  loadCompanionSyncReviewLogPushCursor,
  loadCompanionSyncReviewLog,
  loadCompanionSyncStateChanges,
  loadCompanionSyncStateCursor,
  loadCompanionSyncStatePushCursor,
  saveCompanionSyncNodeVersionCursor,
  saveCompanionSyncNodeVersionPushCursor,
  saveCompanionSyncPackCursor,
  saveCompanionSyncReviewLogCursor,
  saveCompanionSyncReviewLogPushCursor,
  saveCompanionSyncStateCursor,
  saveCompanionSyncStatePushCursor
} from './companionSyncObjects';
export { bootstrapCompanionFromDesktopState } from './companionDesktopSyncBootstrap';

const SYNC_NODE_VERSIONS_PATH = '/companion/sync-node-versions';
const SYNC_OBJECTS_PATH = '/companion/sync-objects';
const SYNC_PACK_PATH = '/companion/sync-pack';
const SYNC_REVIEW_LOG_PATH = '/companion/sync-review-log';
const SYNC_STATE_PATH = '/companion/sync-state';
const CHANGE_PAGE_LIMIT = 500;
const MAX_CHANGE_PAGES = 20;

export interface CompanionDesktopSyncResult {
  appliedNodeIds: string[];
  appliedPackBlobCount: number;
  appliedPackObjectCount: number;
  appliedObjectIds: string[];
  appliedReviewOpIds: string[];
  changedObjectIds: string[];
  pushedNodeIds: string[];
  pushedObjectIds: string[];
  pushedReviewOpIds: string[];
  requestedObjectIds: string[];
  syncedAttachmentIds: string[];
}

const inFlightSyncByEndpoint = new Map<string, Promise<CompanionDesktopSyncResult>>();

function buildStatePath(cursor: number | null) {
  const params = new URLSearchParams();
  params.set('limit', String(CHANGE_PAGE_LIMIT));
  params.set('after_state_seq', String(cursor ?? 0));
  return `${SYNC_STATE_PATH}?${params.toString()}`;
}

function buildPackPath(cursor: number | null) {
  const params = new URLSearchParams();
  params.set('after_state_seq', String(cursor ?? 0));
  return `${SYNC_PACK_PATH}?${params.toString()}`;
}

function normalizeEndpointUrl(endpointUrl: string) {
  return endpointUrl.trim().replace(/\/+$/, '');
}

function buildEventPath(path: string, cursor: NativeSyncChangeCursor | null) {
  const params = new URLSearchParams();
  params.set('limit', String(CHANGE_PAGE_LIMIT));
  if (cursor) {
    params.set('after_created_at', cursor.created_at);
    params.set('after_change_id', cursor.change_id);
  }
  return `${path}?${params.toString()}`;
}

function takeAcceptedPrefix<T>(records: T[], acceptedIds: string[], getId: (record: T) => string) {
  const acceptedCounts = new Map<string, number>();
  for (const id of acceptedIds) {
    acceptedCounts.set(id, (acceptedCounts.get(id) ?? 0) + 1);
  }
  const accepted: T[] = [];
  for (const record of records) {
    const id = getId(record);
    const count = acceptedCounts.get(id) ?? 0;
    if (count <= 0) {
      break;
    }
    acceptedCounts.set(id, count - 1);
    accepted.push(record);
  }
  return accepted;
}

async function pullRemoteStateChanges(endpointUrl: string) {
  let cursor = await loadCompanionSyncStateCursor();
  const appliedObjectIds: string[] = [];
  const changedObjectIds: string[] = [];
  const syncedAttachmentIds: string[] = [];
  for (let page = 0; page < MAX_CHANGE_PAGES; page += 1) {
    const payload = await fetchDesktopJson<{ objects: Array<NativeSyncObjectRecord & { state_seq: number }> }>(
      endpointUrl,
      buildStatePath(cursor)
    );
    if (payload.objects.length > 0) {
      appliedObjectIds.push(...await applyCompanionSyncObjects(payload.objects));
      syncedAttachmentIds.push(...await syncCompanionAttachmentResourcesFromDesktop(endpointUrl, payload.objects));
      changedObjectIds.push(...payload.objects.map((object) => object.object_id));
    }
    const lastObject = payload.objects.at(-1);
    if (!lastObject) break;
    cursor = lastObject.state_seq;
    await saveCompanionSyncStateCursor(cursor);
    if (payload.objects.length < CHANGE_PAGE_LIMIT) break;
  }
  return { appliedObjectIds, changedObjectIds, syncedAttachmentIds };
}

async function pullRemoteStructurePack(endpointUrl: string) {
  const cursor = await loadCompanionSyncPackCursor();
  const pathWithQuery = buildPackPath(cursor);
  const result = await applyCompanionDesktopSyncPack({
    headers: await createSignedRequestHeaders({ method: 'GET', pathWithQuery }),
    url: `${normalizeEndpointUrl(endpointUrl)}${pathWithQuery}`
  });
  if (result.to_state_seq > (cursor ?? 0)) {
    await saveCompanionSyncPackCursor(result.to_state_seq);
  }
  return {
    appliedPackBlobCount: result.applied_blob_count,
    appliedPackObjectCount: result.applied_object_count
  };
}

async function pullRemoteNodeVersions(endpointUrl: string) {
  let cursor = await loadCompanionSyncNodeVersionCursor();
  const appliedNodeIds: string[] = [];
  for (let page = 0; page < MAX_CHANGE_PAGES; page += 1) {
    const payload = await fetchDesktopJson<{ nodes: NativeSyncNodeRecord[] }>(
      endpointUrl,
      buildEventPath(SYNC_NODE_VERSIONS_PATH, cursor)
    );
    if (payload.nodes.length > 0) {
      appliedNodeIds.push(...await applyCompanionSyncNodeVersions(payload.nodes));
    }
    const lastNode = payload.nodes.at(-1);
    if (!lastNode?.version_id || !lastNode.version_created_at) break;
    cursor = { change_id: lastNode.version_id, created_at: lastNode.version_created_at };
    await saveCompanionSyncNodeVersionCursor(cursor);
    if (payload.nodes.length < CHANGE_PAGE_LIMIT) break;
  }
  return { appliedNodeIds };
}

async function pullRemoteReviewLog(endpointUrl: string) {
  let cursor = await loadCompanionSyncReviewLogCursor();
  const appliedReviewOpIds: string[] = [];
  for (let page = 0; page < MAX_CHANGE_PAGES; page += 1) {
    const payload = await fetchDesktopJson<{ reviews: NativeSyncReviewLogRecord[] }>(
      endpointUrl,
      buildEventPath(SYNC_REVIEW_LOG_PATH, cursor)
    );
    if (payload.reviews.length > 0) {
      appliedReviewOpIds.push(...await applyCompanionSyncReviewLog(payload.reviews));
    }
    const lastReview = payload.reviews.at(-1);
    if (!lastReview) break;
    cursor = { change_id: lastReview.op_id, created_at: lastReview.reviewed_at };
    await saveCompanionSyncReviewLogCursor(cursor);
    if (payload.reviews.length < CHANGE_PAGE_LIMIT) break;
  }
  return { appliedReviewOpIds };
}

async function pushLocalStateChanges(endpointUrl: string) {
  let cursor = await loadCompanionSyncStatePushCursor();
  const pushedObjectIds: string[] = [];
  for (let page = 0; page < MAX_CHANGE_PAGES; page += 1) {
    const objects = await loadCompanionSyncStateChanges(cursor, CHANGE_PAGE_LIMIT);
    if (objects.length === 0) break;
    const response = await postDesktopJson<{ applied_object_ids: string[] }>(endpointUrl, SYNC_OBJECTS_PATH, { objects });
    const acceptedObjects = takeAcceptedPrefix(
      objects,
      response.applied_object_ids ?? [],
      (object) => `${object.object_type}:${object.object_id}`
    );
    pushedObjectIds.push(...acceptedObjects.map((object) => object.object_id));
    const lastObject = acceptedObjects.at(-1);
    if (!lastObject) break;
    cursor = lastObject.state_seq;
    await saveCompanionSyncStatePushCursor(cursor);
    if (acceptedObjects.length < objects.length || objects.length < CHANGE_PAGE_LIMIT) break;
  }
  return { pushedObjectIds };
}

async function pushLocalNodeVersions(endpointUrl: string) {
  let cursor = await loadCompanionSyncNodeVersionPushCursor();
  const pushedNodeIds: string[] = [];
  for (let page = 0; page < MAX_CHANGE_PAGES; page += 1) {
    const nodes = await loadCompanionSyncNodeVersions(cursor, CHANGE_PAGE_LIMIT);
    if (nodes.length === 0) break;
    const response = await postDesktopJson<{ applied_node_ids: string[] }>(endpointUrl, SYNC_NODE_VERSIONS_PATH, { nodes });
    const acceptedNodes = takeAcceptedPrefix(nodes, response.applied_node_ids ?? [], (node) => node.object_id);
    pushedNodeIds.push(...acceptedNodes.map((node) => node.object_id));
    const lastNode = acceptedNodes.at(-1);
    if (!lastNode?.version_id || !lastNode.version_created_at) break;
    cursor = { change_id: lastNode.version_id, created_at: lastNode.version_created_at };
    await saveCompanionSyncNodeVersionPushCursor(cursor);
    if (acceptedNodes.length < nodes.length || nodes.length < CHANGE_PAGE_LIMIT) break;
  }
  return { pushedNodeIds };
}

async function pushLocalReviewLog(endpointUrl: string) {
  let cursor = await loadCompanionSyncReviewLogPushCursor();
  const pushedReviewOpIds: string[] = [];
  for (let page = 0; page < MAX_CHANGE_PAGES; page += 1) {
    const reviews = await loadCompanionSyncReviewLog(cursor, CHANGE_PAGE_LIMIT);
    if (reviews.length === 0) break;
    const response = await postDesktopJson<{ applied_op_ids: string[] }>(endpointUrl, SYNC_REVIEW_LOG_PATH, { reviews });
    const acceptedReviews = takeAcceptedPrefix(reviews, response.applied_op_ids ?? [], (review) => review.op_id);
    pushedReviewOpIds.push(...acceptedReviews.map((review) => review.op_id));
    const lastReview = acceptedReviews.at(-1);
    if (!lastReview) break;
    cursor = { change_id: lastReview.op_id, created_at: lastReview.reviewed_at };
    await saveCompanionSyncReviewLogPushCursor(cursor);
    if (acceptedReviews.length < reviews.length || reviews.length < CHANGE_PAGE_LIMIT) break;
  }
  return { pushedReviewOpIds };
}

async function runCompanionObjectsSync(endpointUrl: string): Promise<CompanionDesktopSyncResult> {
  const pushedNodes = await pushLocalNodeVersions(endpointUrl);
  const pushed = await pushLocalStateChanges(endpointUrl);
  const pushedReviews = await pushLocalReviewLog(endpointUrl);
  const pack = await pullRemoteStructurePack(endpointUrl);
  const nodes = await pullRemoteNodeVersions(endpointUrl);
  const reviews = await pullRemoteReviewLog(endpointUrl);
  const changes = await pullRemoteStateChanges(endpointUrl);
  return {
    appliedNodeIds: nodes.appliedNodeIds,
    appliedPackBlobCount: pack.appliedPackBlobCount,
    appliedPackObjectCount: pack.appliedPackObjectCount,
    appliedObjectIds: changes.appliedObjectIds,
    appliedReviewOpIds: reviews.appliedReviewOpIds,
    changedObjectIds: changes.changedObjectIds,
    pushedNodeIds: pushedNodes.pushedNodeIds,
    pushedObjectIds: pushed.pushedObjectIds,
    pushedReviewOpIds: pushedReviews.pushedReviewOpIds,
    requestedObjectIds: [],
    syncedAttachmentIds: changes.syncedAttachmentIds
  };
}

export function syncCompanionObjectsFromDesktop(endpointUrl: string): Promise<CompanionDesktopSyncResult> {
  const cacheKey = endpointUrl.trim();
  const inFlightSync = inFlightSyncByEndpoint.get(cacheKey);
  if (inFlightSync) {
    return inFlightSync;
  }
  const nextSync = runCompanionObjectsSync(endpointUrl).finally(() => {
    if (inFlightSyncByEndpoint.get(cacheKey) === nextSync) {
      inFlightSyncByEndpoint.delete(cacheKey);
    }
  });
  inFlightSyncByEndpoint.set(cacheKey, nextSync);
  return nextSync;
}
