import { isCanonicalAttachmentStorageKey } from '../../../lib/platform/attachmentResource';
import type { NativeSyncObjectRecord } from '../../../lib/platform/nativeSyncContract';

import { invalidateAttachmentResourceResolution } from './attachmentResources';
import { createSignedRequestHeaders } from './companion/network/signedRequest';
import { commitStagedCompanionAttachmentBatch } from './companion/runtime/companionBatchDataPlane';
import { getIosCompanionDatabaseOwner } from './companion/runtime/iosCompanionDatabaseBootstrap';
import { loadCompanionMissingAttachmentResource } from './companionSyncObjects';
import {
  FolioleCompanionSync,
  isNativeCompanionAttachmentResourceRuntime,
  normalizeEndpointUrl
} from './companionWorkspaceRuntimeRepository';

const ATTACHMENT_RESOURCE_PATH = '/companion/attachment-resource';
export const ATTACHMENT_RESOURCE_CONCURRENT_FETCH_LIMIT = 6;

interface AttachmentResourceRequest {
  attachmentId: string;
  contentHash: string;
  mimeType: string;
  storageKey: string;
}

function parsePayload(record: NativeSyncObjectRecord) {
  if (!record.payload_json) {
    return null;
  }
  try {
    return JSON.parse(record.payload_json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function toAttachmentResourceRequest(record: NativeSyncObjectRecord): AttachmentResourceRequest | null {
  if (record.object_type !== 'attachment' || record.deleted_at) {
    return null;
  }
  const payload = parsePayload(record);
  const blob = payload?.blob && typeof payload.blob === 'object'
    ? payload.blob as Record<string, unknown>
    : null;
  const contentHash = text(blob?.content_hash);
  const mimeType = text(blob?.mime_type);
  const storageKey = text(blob?.storage_key);
  if (!contentHash || !mimeType || !storageKey ||
      !isCanonicalAttachmentStorageKey(storageKey, contentHash, mimeType)) {
    return null;
  }
  return {
    attachmentId: record.object_id,
    contentHash,
    mimeType,
    storageKey
  };
}

function buildAttachmentResourcePath(request: AttachmentResourceRequest) {
  const params = new URLSearchParams();
  params.set('attachment_id', request.attachmentId);
  params.set('content_hash', request.contentHash);
  return `${ATTACHMENT_RESOURCE_PATH}?${params.toString()}`;
}

async function buildSignedAttachmentResourceRequest(endpoint: string, request: AttachmentResourceRequest) {
  const pathWithQuery = buildAttachmentResourcePath(request);
  return {
    attachment_id: request.attachmentId,
    content_hash: request.contentHash,
    mime_type: request.mimeType,
    storage_key: request.storageKey,
    headers: await createSignedRequestHeaders({ endpointUrl: endpoint, method: 'GET', pathWithQuery }),
    url: `${endpoint}${pathWithQuery}`
  };
}

export async function syncCompanionAttachmentResourcesFromDesktop(
  endpointUrl: string,
  records: NativeSyncObjectRecord[]
) {
  return syncCompanionAttachmentResourceRequestsFromDesktop(
    endpointUrl,
    records
      .map(toAttachmentResourceRequest)
      .filter((request): request is AttachmentResourceRequest => Boolean(request))
  );
}

export async function syncCompanionAttachmentResourceRequestsFromDesktop(
  endpointUrl: string,
  requests: AttachmentResourceRequest[],
  onSyncedChunk?: (attachmentIds: string[]) => void
) {
  if (!isNativeCompanionAttachmentResourceRuntime()) {
    return [];
  }
  const endpoint = normalizeEndpointUrl(endpointUrl);
  const syncedAttachmentIds: string[] = [];
  const uniqueRequests = [...new Map(requests.map((request) => [request.storageKey, request])).values()];
  for (let index = 0; index < uniqueRequests.length; index += ATTACHMENT_RESOURCE_CONCURRENT_FETCH_LIMIT) {
    const chunk = uniqueRequests.slice(index, index + ATTACHMENT_RESOURCE_CONCURRENT_FETCH_LIMIT);
    const results = await syncAttachmentResourceRequestBatch(endpoint, chunk);
    syncedAttachmentIds.push(...results);
    if (results.length > 0) {
      onSyncedChunk?.(results);
    }
  }
  return syncedAttachmentIds;
}

async function syncAttachmentResourceRequestBatch(endpoint: string, requests: AttachmentResourceRequest[]) {
  try {
    return await syncAttachmentResourceRequestBatchOnce(endpoint, requests);
  } catch {
    return [];
  }
}

async function syncAttachmentResourceRequestBatchOnce(endpoint: string, requests: AttachmentResourceRequest[]) {
  const resources = await Promise.all(requests.map((request) => buildSignedAttachmentResourceRequest(endpoint, request)));
  const download = await FolioleCompanionSync.downloadAttachmentResourceBatch({ resources });
  const result = await commitStagedCompanionAttachmentBatch(
    getIosCompanionDatabaseOwner(), FolioleCompanionSync, download.batch_token
  );
  return result.syncedIds;
}

export async function syncCompanionAttachmentResourceFromDesktop(
  endpointUrl: string,
  attachmentId: string
) {
  const request = await loadCompanionMissingAttachmentResource(attachmentId);
  if (!request) {
    return { attachmentId, status: 'not_queued' as const };
  }
  const syncedIds = await syncCompanionAttachmentResourceRequestsFromDesktop(endpointUrl, [{
    attachmentId: request.attachment_id,
    contentHash: request.content_hash,
    mimeType: request.mime_type,
    storageKey: request.storage_key
  }]);
  if (syncedIds.includes(attachmentId)) {
    invalidateAttachmentResourceResolution(attachmentId);
  }
  return {
    attachmentId,
    status: syncedIds.includes(attachmentId) ? 'cached' as const : 'missing' as const
  };
}
