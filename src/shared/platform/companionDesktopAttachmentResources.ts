import type { NativeSyncObjectRecord } from '../../../lib/platform/nativeSyncContract';

import { invalidateAttachmentResourceResolution } from './attachmentResources';
import { loadCompanionMissingAttachmentResource } from './companionSyncObjects';
import { createSignedRequestHeaders } from './companionWorkspacePairing';
import {
  FolioleCompanionSync,
  isNativeAndroidCompanionRuntime,
  normalizeEndpointUrl
} from './companionWorkspaceSyncBridge';

const ATTACHMENT_RESOURCE_PATH = '/companion/attachment-resource';
export const ATTACHMENT_RESOURCE_CONCURRENT_FETCH_LIMIT = 6;

interface AttachmentResourceRequest {
  attachmentId: string;
  contentHash: string;
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
  if (!contentHash) {
    return null;
  }
  return {
    attachmentId: record.object_id,
    contentHash
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
    headers: await createSignedRequestHeaders({ method: 'GET', pathWithQuery }),
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
  if (!isNativeAndroidCompanionRuntime()) {
    return [];
  }
  const endpoint = normalizeEndpointUrl(endpointUrl);
  const syncedAttachmentIds: string[] = [];
  let failedAttachmentCount = 0;
  for (let index = 0; index < requests.length; index += ATTACHMENT_RESOURCE_CONCURRENT_FETCH_LIMIT) {
    const chunk = requests.slice(index, index + ATTACHMENT_RESOURCE_CONCURRENT_FETCH_LIMIT);
    const results = await syncAttachmentResourceRequestBatch(endpoint, chunk);
    if (results.length === 0) {
      failedAttachmentCount += chunk.length;
    }
    syncedAttachmentIds.push(...results);
    if (results.length > 0) {
      onSyncedChunk?.(results);
    }
  }
  if (requests.length > 0 && failedAttachmentCount === requests.length) {
    throw new Error('Attachment batch could not download any requested file.');
  }
  return syncedAttachmentIds;
}

async function syncAttachmentResourceRequestBatch(endpoint: string, requests: AttachmentResourceRequest[]) {
  try {
    const resources = await Promise.all(requests.map((request) => buildSignedAttachmentResourceRequest(endpoint, request)));
    const result = await FolioleCompanionSync.syncAttachmentResources({ resources });
    return result.synced_attachment_ids;
  } catch {
    return syncAttachmentResourceRequestFallback(endpoint, requests);
  }
}

async function syncAttachmentResourceRequestFallback(endpoint: string, requests: AttachmentResourceRequest[]) {
  const results = await Promise.all(requests.map((request) => syncAttachmentResourceRequest(endpoint, request)));
  return results.filter((result): result is string => Boolean(result));
}

async function syncAttachmentResourceRequest(endpoint: string, request: AttachmentResourceRequest) {
  try {
    await FolioleCompanionSync.syncAttachmentResource(await buildSignedAttachmentResourceRequest(endpoint, request));
    return request.attachmentId;
  } catch {
    return null;
  }
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
    contentHash: request.content_hash
  }]);
  if (syncedIds.includes(attachmentId)) {
    invalidateAttachmentResourceResolution(attachmentId);
  }
  return {
    attachmentId,
    status: syncedIds.includes(attachmentId) ? 'cached' as const : 'missing' as const
  };
}
