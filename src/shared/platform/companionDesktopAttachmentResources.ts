import type { NativeSyncObjectRecord } from '../../../lib/platform/nativeSyncContract';

import { loadCompanionMissingAttachmentResources } from './companionSyncObjects';
import { createSignedRequestHeaders } from './companionWorkspacePairing';
import {
  FolioleCompanionSync,
  isNativeAndroidCompanionRuntime,
  normalizeEndpointUrl
} from './companionWorkspaceSyncBridge';

const ATTACHMENT_RESOURCE_PATH = '/companion/attachment-resource';

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
  requests: AttachmentResourceRequest[]
) {
  if (!isNativeAndroidCompanionRuntime()) {
    return [];
  }
  const endpoint = normalizeEndpointUrl(endpointUrl);
  const syncedAttachmentIds: string[] = [];
  for (const request of requests) {
    const pathWithQuery = buildAttachmentResourcePath(request);
    await FolioleCompanionSync.syncAttachmentResource({
      attachment_id: request.attachmentId,
      content_hash: request.contentHash,
      headers: await createSignedRequestHeaders({ method: 'GET', pathWithQuery }),
      url: `${endpoint}${pathWithQuery}`
    });
    syncedAttachmentIds.push(request.attachmentId);
  }
  return syncedAttachmentIds;
}

export async function syncCompanionAttachmentResourceFromDesktop(
  endpointUrl: string,
  attachmentId: string,
  searchLimit = 256
) {
  const requests = await loadCompanionMissingAttachmentResources(searchLimit);
  const request = requests.find((item) => item.attachment_id === attachmentId);
  if (!request) {
    return { attachmentId, status: 'not_queued' as const };
  }
  const syncedIds = await syncCompanionAttachmentResourceRequestsFromDesktop(endpointUrl, [{
    attachmentId: request.attachment_id,
    contentHash: request.content_hash
  }]);
  return {
    attachmentId,
    status: syncedIds.includes(attachmentId) ? 'cached' as const : 'missing' as const
  };
}
