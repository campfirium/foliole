import type http from 'node:http';

import { loadWorkspaceSnapshot, loadWorkspaceVersionMetadata } from '../database/workspaceSnapshot.js';

import { buildCompanionSyncDiagnostics } from './buildCompanionSyncDiagnostics.js';
import {
  ATTACHMENT_RESOURCE_PATH,
  loadCompanionAttachmentResource
} from './companionLanAttachmentResources.js';
import { handleAuthenticatedPost } from './companionLanAuthenticatedPost.js';
import {
  CONTENT_BLOB_ACK_PATH,
  CONTENT_BLOB_RESOURCE_PATH,
  loadCompanionContentBlobResource
} from './companionLanContentBlobs.js';
import { loadCompanionLanDiscovery } from './companionLanDiscovery.js';
import { handlePairRequest } from './companionLanPairCompletion.js';
import { handlePairRequestCreate } from './companionLanPairingEndpoints.js';
import {
  buildWorkspaceSnapshotPayload,
  buildWorkspaceVersionPayload
} from './companionLanPayloads.js';
import {
  writeJson, writeOptions, writeWorkgroupBinary, writeWorkgroupFileStream
} from './companionLanResponses.js';
import {
  isRetiredSyncJsonEndpoint,
  SYNC_INDEX_PATH,
  SYNC_NODE_VERSIONS_PATH,
  SYNC_OBJECTS_PATH,
  SYNC_REVIEW_LOG_PATH,
  SYNC_STATE_PATH
} from './companionLanSyncObjects.js';
import { SYNC_PACK_PATH } from './companionLanSyncPack.js';
import { handleSyncPackGet } from './companionLanSyncPackGet.js';
import { authenticateCompanionRequest } from './companionRequestAuth.js';
import { SYNC_PACK_ACK_PATH } from './desktopSyncPackAck.js';

export const DISCOVERY_ENDPOINT_PATH = '/companion/discovery';
export const PAIR_ENDPOINT_PATH = '/companion/pair';
export const PAIR_REQUESTS_ENDPOINT_PATH = '/companion/pair-requests';
export const WORKSPACE_VERSION_PATH = '/companion/workspace-version';
export const WORKSPACE_SNAPSHOT_PATH = '/companion/workspace-snapshot';
export const SYNC_DIAGNOSTICS_PATH = '/companion/diagnostics/sync';
export {
  ATTACHMENT_RESOURCE_PATH,
  CONTENT_BLOB_RESOURCE_PATH,
  CONTENT_BLOB_ACK_PATH,
  SYNC_INDEX_PATH,
  SYNC_NODE_VERSIONS_PATH,
  SYNC_OBJECTS_PATH,
  SYNC_PACK_ACK_PATH,
  SYNC_PACK_PATH,
  SYNC_REVIEW_LOG_PATH,
  SYNC_STATE_PATH
};

function writeUnhandledRequestError(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  error: unknown
) {
  console.warn('[companion-sync] unhandled LAN request error', { error, url: request.url ?? null });
  if (!response.writableEnded) {
    writeJson(request, response, 500, { error: 'internal_server_error' });
  }
}

function handleWorkspaceMetadataGet(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  parsedRequestUrl: URL,
  args: {
    appVersion: string;
    authenticatedDeviceId: string;
    getSyncStatus: () => Parameters<typeof buildCompanionSyncDiagnostics>[0]['serverStatus'];
    peerId: string;
  }
) {
  if (parsedRequestUrl.pathname === WORKSPACE_VERSION_PATH) {
    const version = loadWorkspaceVersionMetadata();
    writeJson(request, response, 200, buildWorkspaceVersionPayload(args.appVersion, args.peerId, version));
    return true;
  }
  if (parsedRequestUrl.pathname === SYNC_DIAGNOSTICS_PATH) {
    writeJson(request, response, 200, buildCompanionSyncDiagnostics({
      appVersion: args.appVersion,
      serverStatus: args.getSyncStatus()
    }), 'GET, OPTIONS');
    return true;
  }
  return false;
}

async function handlePostRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  parsedRequestUrl: URL,
  args: {
    appVersion: string;
    onPairRequestCreated: (() => void) | null;
    peerId: string;
    updatePairingStatus: (pairing: { paired_device_count: number; pending_pair_request_count: number }) => void;
  }
) {
  if (parsedRequestUrl.pathname === PAIR_REQUESTS_ENDPOINT_PATH) {
    await handlePairRequestCreate(request, response, args.updatePairingStatus, args.onPairRequestCreated, writeJson);
    return true;
  }
  if (parsedRequestUrl.pathname === PAIR_ENDPOINT_PATH) {
    await handlePairRequest(request, response, args.appVersion, args.peerId, args.updatePairingStatus, writeJson);
    return true;
  }
  return false;
}

async function handleAuthenticatedGet(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  parsedRequestUrl: URL,
  args: {
    appVersion: string;
    authenticatedDeviceId: string;
    getSyncStatus: () => Parameters<typeof buildCompanionSyncDiagnostics>[0]['serverStatus'];
    peerId: string;
  }
) {
  if (request.method === 'GET' && isRetiredSyncJsonEndpoint(parsedRequestUrl)) {
    writeJson(request, response, 410, { error: 'sync_json_endpoint_retired' }, 'GET, OPTIONS');
    return;
  }
  if (parsedRequestUrl.pathname === ATTACHMENT_RESOURCE_PATH) {
    const resource = await loadCompanionAttachmentResource(
      parsedRequestUrl.searchParams.get('attachment_id'),
      parsedRequestUrl.searchParams.get('content_hash')
    );
    if (resource.status === 'ready') {
      await writeWorkgroupFileStream(request, response, 200, resource);
    } else {
      writeJson(request, response, resource.statusCode, { error: resource.error }, 'GET, OPTIONS');
    }
    return;
  }
  if (parsedRequestUrl.pathname === CONTENT_BLOB_RESOURCE_PATH) {
    const resource = await loadCompanionContentBlobResource(parsedRequestUrl.searchParams.get('hash'));
    if (resource.status === 'ready') {
      writeWorkgroupBinary(request, response, 200, resource.body, resource.mimeType);
    } else {
      writeJson(request, response, resource.statusCode, { error: resource.error }, 'GET, OPTIONS');
    }
    return;
  }
  if (await handleSyncPackGet(
    request,
    response,
    parsedRequestUrl,
    args.authenticatedDeviceId,
    writeJson
  )) return;
  if (handleWorkspaceMetadataGet(request, response, parsedRequestUrl, args)) return;
  if (parsedRequestUrl.pathname !== WORKSPACE_SNAPSHOT_PATH) {
    writeJson(request, response, 404, { error: 'not_found' });
    return;
  }
  const snapshot = loadWorkspaceSnapshot({ includeBody: true });
  writeJson(request, response, 200, buildWorkspaceSnapshotPayload(args.appVersion, args.peerId, snapshot));
}

export function createLanWorkspaceSyncRequestHandler(args: {
  appVersion: string;
  getSyncStatus?: () => Parameters<typeof buildCompanionSyncDiagnostics>[0]['serverStatus'];
  onPairRequestCreated: (() => void) | null;
  peerId: string;
  updatePairingStatus: (pairing: { paired_device_count: number; pending_pair_request_count: number }) => void;
}) {
  return async (request: http.IncomingMessage, response: http.ServerResponse) => {
    try {
    const parsedRequestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'OPTIONS') {
      writeOptions(request, response);
      return;
    }
    if (request.method === 'GET' && parsedRequestUrl.pathname === DISCOVERY_ENDPOINT_PATH) {
      const discovery = await loadCompanionLanDiscovery(args.appVersion, args.peerId);
      writeJson(request, response, discovery ? 200 : 404, discovery ?? { error: 'sync_group_not_available' });
      return;
    }
    if (request.method === 'POST') {
      if (await handlePostRequest(request, response, parsedRequestUrl, args)) return;
      if (await handleAuthenticatedPost(request, response, parsedRequestUrl, writeJson)) return;
    }
    if (request.method !== 'GET') {
      writeJson(request, response, 405, { error: 'method_not_allowed' });
      return;
    }
    if (parsedRequestUrl.pathname === '/health') {
      writeJson(request, response, 200, { ok: true });
      return;
    }
    const auth = authenticateCompanionRequest({ request });
    if (!auth.ok) {
      writeJson(request, response, auth.status_code, { error: auth.error });
      return;
    }
    await handleAuthenticatedGet(request, response, parsedRequestUrl, {
      ...args,
      authenticatedDeviceId: auth.device_id,
      getSyncStatus: args.getSyncStatus ?? (() => null)
    });
    } catch (error) {
      writeUnhandledRequestError(request, response, error);
    }
  };
}
