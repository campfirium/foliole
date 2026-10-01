import { classifyResourceFailure, resourceKey } from '../../../lib/platform/resourceAvailabilityContract';

import { invalidateAttachmentResourceResolution } from './attachmentResources';
import { runCompanionResourceProviderBatch } from './companion/network/companionResourceProviders';
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

function buildAttachmentResourcePath(request: AttachmentResourceRequest) {
  const params = new URLSearchParams();
  params.set('attachment_id', request.attachmentId);
  params.set('content_hash', request.contentHash);
  params.set('storage_key', request.storageKey);
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

export async function syncCompanionAttachmentResourceRequestsFromDesktop(
  endpointUrl: string,
  requests: AttachmentResourceRequest[],
  onSyncedChunk?: (attachmentIds: string[]) => void,
  onProviderTransfer?: Parameters<typeof runCompanionResourceProviderBatch>[0]['onTransfer']
) {
  if (!isNativeCompanionAttachmentResourceRuntime()) {
    return [];
  }
  const endpoint = normalizeEndpointUrl(endpointUrl);
  const syncedAttachmentIds: string[] = [];
  const uniqueRequests = [...new Map(requests.map((request) => [request.storageKey, request])).values()];
  for (let index = 0; index < uniqueRequests.length; index += ATTACHMENT_RESOURCE_CONCURRENT_FETCH_LIMIT) {
    const chunk = uniqueRequests.slice(index, index + ATTACHMENT_RESOURCE_CONCURRENT_FETCH_LIMIT);
    const result = await runCompanionResourceProviderBatch({ endpointUrl: endpoint,
      ...(onProviderTransfer ? { onTransfer: onProviderTransfer } : {}),
      needs: chunk.map((request) => ({ kind: 'attachment', id: request.attachmentId, storage_key: request.storageKey })),
      transfer: async (providerEndpoint, selected) => {
        const requested = chunk.filter((request) => selected.some((need) => need.id === request.attachmentId));
        return syncAttachmentResourceRequestBatch(providerEndpoint, requested);
      }
    });
    const results = result.ready.map((key) => key.slice('attachment:'.length));
    syncedAttachmentIds.push(...results);
    if (results.length > 0) {
      onSyncedChunk?.(results);
    }
    if (result.issues.some((issue) => issue.error === 'disk_full')) {
      throw new Error('attachment_resource_disk_full');
    }
  }
  return syncedAttachmentIds;
}

async function syncAttachmentResourceRequestBatch(endpoint: string, requests: AttachmentResourceRequest[]) {
  try {
    return await syncAttachmentResourceRequestBatchOnce(endpoint, requests);
  } catch (error) {
    return { ready: [], errors: Object.fromEntries(requests.map((request) => [
      resourceKey({ kind: 'attachment', id: request.attachmentId, storage_key: request.storageKey }), classifyResourceFailure(error)
    ])) };
  }
}

async function syncAttachmentResourceRequestBatchOnce(endpoint: string, requests: AttachmentResourceRequest[]) {
  const resources = await Promise.all(requests.map((request) => buildSignedAttachmentResourceRequest(endpoint, request)));
  const owner = getIosCompanionDatabaseOwner();
  const download = await FolioleCompanionSync.downloadAttachmentResourceBatch({
    database_path: owner.databasePath, resources
  });
  const result = await commitStagedCompanionAttachmentBatch(owner, FolioleCompanionSync, download.batch_token);
  return { ready: result.syncedIds.map((id) => `attachment:${id}`),
    errors: Object.fromEntries(requests.filter((request) => !result.syncedIds.includes(request.attachmentId)).map((request) => [
      `attachment:${request.attachmentId}`, download.failed_attachment_errors?.[request.attachmentId] ??
        (download.failed_attachment_ids?.includes(request.attachmentId) ? 'protocol_error' as const : 'checksum_mismatch' as const)
    ]))
  };
}

export async function syncCompanionAttachmentResourceFromDesktop(
  endpointUrl: string,
  attachmentId: string,
  onProviderTransfer?: Parameters<typeof runCompanionResourceProviderBatch>[0]['onTransfer']
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
  }], undefined, onProviderTransfer);
  if (syncedIds.includes(attachmentId)) {
    invalidateAttachmentResourceResolution(attachmentId);
  }
  return {
    attachmentId,
    status: syncedIds.includes(attachmentId) ? 'cached' as const : 'missing' as const
  };
}
