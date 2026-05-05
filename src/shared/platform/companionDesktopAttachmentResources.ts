import type { NativeSyncObjectRecord } from '../../../lib/platform/nativeSyncContract';

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
  if (!isNativeAndroidCompanionRuntime()) {
    return [];
  }
  const endpoint = normalizeEndpointUrl(endpointUrl);
  const syncedAttachmentIds: string[] = [];
  for (const record of records) {
    const request = toAttachmentResourceRequest(record);
    if (!request) continue;
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
