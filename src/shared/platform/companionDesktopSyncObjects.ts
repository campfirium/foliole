import { postDesktopJson } from './companionDesktopSyncHttp';
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
export const CONTENT_BLOB_BATCH_LIMIT = 32;
export const COMPANION_DESKTOP_SYNC_STEP_TIMEOUT_MS = 60_000;

export interface CompanionDesktopSyncOptions {
  onStructureSynced?: () => Promise<void> | void;
}

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
  contentBlobError: string | null;
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
  await postDesktopJson(endpointUrl, CONTENT_BLOB_ACK_PATH, { hashes: [hash] });
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
  const hashes = await loadCompanionMissingContentBlobHashes(CONTENT_BLOB_BATCH_LIMIT);
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
  return { syncedContentBlobHashes };
}

export async function syncCompanionContentBlobFromDesktop(endpointUrl: string, hash: string) {
  const endpoint = normalizeEndpointUrl(endpointUrl);
  const pathWithQuery = buildContentBlobPath(hash);
  const result = await syncCompanionContentBlob({
    hash,
    headers: await createSignedRequestHeaders({ method: 'GET', pathWithQuery }),
    url: `${endpoint}${pathWithQuery}`
  });
  if (result.availability === 'cached') {
    await ackContentBlob(endpoint, result.hash);
  }
  return result;
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Desktop content blob sync failed.';
}

async function runCompanionObjectsSync(
  endpointUrl: string,
  options: CompanionDesktopSyncOptions = {}
): Promise<CompanionDesktopSyncResult> {
  const pack = await withSyncStepTimeout('applying the structure pack', pullRemoteStructurePack(endpointUrl));
  await options.onStructureSynced?.();
  let contentBlobError: string | null = null;
  let syncedContentBlobHashes: string[] = [];
  try {
    const blobs = await withSyncStepTimeout('fetching a content blob batch', pullMissingContentBlobs(endpointUrl));
    syncedContentBlobHashes = blobs.syncedContentBlobHashes;
  } catch (error) {
    contentBlobError = errorMessage(error);
  }
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
    contentBlobError,
    syncedContentBlobHashes
  };
}

export function syncCompanionObjectsFromDesktop(
  endpointUrl: string,
  options: CompanionDesktopSyncOptions = {}
): Promise<CompanionDesktopSyncResult> {
  const cacheKey = endpointUrl.trim();
  const inFlightSync = inFlightSyncByEndpoint.get(cacheKey);
  if (inFlightSync) {
    return inFlightSync;
  }
  const nextSync = runCompanionObjectsSync(endpointUrl, options).finally(() => {
    if (inFlightSyncByEndpoint.get(cacheKey) === nextSync) {
      inFlightSyncByEndpoint.delete(cacheKey);
    }
  });
  inFlightSyncByEndpoint.set(cacheKey, nextSync);
  return nextSync;
}
