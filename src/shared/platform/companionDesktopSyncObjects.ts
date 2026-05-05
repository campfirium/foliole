import {
  applyCompanionDesktopSyncPack,
  loadCompanionMissingContentBlobHashes,
  loadCompanionSyncPackCursor,
  saveCompanionSyncPackCursor,
  syncCompanionContentBlob
} from './companionSyncObjects';
import { createSignedRequestHeaders } from './companionWorkspacePairing';

const CONTENT_BLOB_RESOURCE_PATH = '/companion/content-blob';
const CONTENT_BLOB_ACK_PATH = '/companion/content-blob/ack';
const SYNC_PACK_PATH = '/companion/sync-pack';
const CHANGE_PAGE_LIMIT = 500;
const MAX_CHANGE_PAGES = 20;
export const COMPANION_DESKTOP_SYNC_STEP_TIMEOUT_MS = 60_000;

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
  syncedContentBlobHashes: string[];
}

const inFlightSyncByEndpoint = new Map<string, Promise<CompanionDesktopSyncResult>>();

function buildPackPath(cursor: number | null) {
  const params = new URLSearchParams();
  params.set('after_state_seq', String(cursor ?? 0));
  return `${SYNC_PACK_PATH}?${params.toString()}`;
}

function buildContentBlobPath(hash: string) {
  const params = new URLSearchParams();
  params.set('hash', hash);
  return `${CONTENT_BLOB_RESOURCE_PATH}?${params.toString()}`;
}

async function ackContentBlob(endpointUrl: string, hash: string) {
  const bodyText = JSON.stringify({ hashes: [hash] });
  const headers = await createSignedRequestHeaders({
    bodyText,
    method: 'POST',
    pathWithQuery: CONTENT_BLOB_ACK_PATH
  });
  const response = await fetch(`${endpointUrl}${CONTENT_BLOB_ACK_PATH}`, {
    body: bodyText,
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    method: 'POST'
  });
  if (!response.ok) {
    throw new Error(`Content blob ack failed with ${response.status}.`);
  }
}

function normalizeEndpointUrl(endpointUrl: string) {
  return endpointUrl.trim().replace(/\/+$/, '');
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

async function pullMissingContentBlobs(endpointUrl: string) {
  const endpoint = normalizeEndpointUrl(endpointUrl);
  const syncedContentBlobHashes: string[] = [];
  for (let page = 0; page < MAX_CHANGE_PAGES; page += 1) {
    const hashes = await loadCompanionMissingContentBlobHashes(CHANGE_PAGE_LIMIT);
    if (hashes.length === 0) break;
    for (const hash of hashes) {
      const pathWithQuery = buildContentBlobPath(hash);
      const result = await syncCompanionContentBlob({
        hash,
        headers: await createSignedRequestHeaders({ method: 'GET', pathWithQuery }),
        url: `${endpoint}${pathWithQuery}`
      });
      if (result.availability === 'cached') {
        await ackContentBlob(endpoint, result.hash);
        syncedContentBlobHashes.push(result.hash);
      }
    }
    if (hashes.length < CHANGE_PAGE_LIMIT) break;
  }
  return { syncedContentBlobHashes };
}

async function withSyncStepTimeout<T>(stage: string, work: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Desktop sync timed out while ${stage}.`));
    }, COMPANION_DESKTOP_SYNC_STEP_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function runCompanionObjectsSync(endpointUrl: string): Promise<CompanionDesktopSyncResult> {
  const pack = await withSyncStepTimeout('applying the structure pack', pullRemoteStructurePack(endpointUrl));
  const blobs = await withSyncStepTimeout('fetching content blobs', pullMissingContentBlobs(endpointUrl));
  return {
    appliedNodeIds: [],
    appliedPackBlobCount: pack.appliedPackBlobCount,
    appliedPackObjectCount: pack.appliedPackObjectCount,
    appliedObjectIds: [],
    appliedReviewOpIds: [],
    changedObjectIds: [],
    pushedNodeIds: [],
    pushedObjectIds: [],
    pushedReviewOpIds: [],
    requestedObjectIds: [],
    syncedAttachmentIds: [],
    syncedContentBlobHashes: blobs.syncedContentBlobHashes
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
