import type http from 'node:http';

import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';

import type { buildCompanionSyncDiagnostics } from './buildCompanionSyncDiagnostics.js';
import { handleCompanionAttachmentGet } from './companionLanAttachmentGet.js';
import { ATTACHMENT_RESOURCE_PATH } from './companionLanAttachmentResources.js';
import { handleAuthenticatedPost } from './companionLanAuthenticatedPost.js';
import {
  CONTENT_BLOB_ACK_PATH,
  CONTENT_BLOB_RESOURCE_PATH,
  loadCompanionContentBlobResource
} from './companionLanContentBlobs.js';
import { loadCompanionLanDiscovery } from './companionLanDiscovery.js';
import { handleProductionCompanionFramedSyncPost } from './companionLanFramedSyncRoute.js';
import { handleCompanionIdentityGet } from './companionLanIdentityGet.js';
import {
  buildWorkspaceSnapshotPayload,
} from './companionLanPayloads.js';
import { writeJson, writeOptions, writeWorkgroupBinary } from './companionLanResponses.js';
import {
  isRetiredSyncJsonEndpoint,
  SYNC_INDEX_PATH,
  SYNC_NODE_VERSIONS_PATH,
  SYNC_OBJECTS_PATH,
  SYNC_REVIEW_LOG_PATH,
  SYNC_STATE_PATH
} from './companionLanSyncObjects.js';
import { SYNC_PACK_PATH } from './companionLanSyncPack.js';
import { handleCompanionSyncPackFactsGet, SYNC_PACK_FACTS_PATH } from './companionLanSyncPackFacts.js';
import { handleSyncPackGet } from './companionLanSyncPackGet.js';
import {
  handleWorkspaceMetadataGet,
  SYNC_DIAGNOSTICS_PATH,
  WORKSPACE_VERSION_PATH
} from './companionLanWorkspaceMetadataGet.js';
import { authenticateCompanionRequest } from './companionRequestAuth.js';
import { SYNC_GROUP_MEMBER_STATE_PATH } from './desktopSyncGroupMemberState.js';
import {
  handleSyncGroupJoinAcceptance,
  handleSyncGroupJoinRequest
} from './syncGroupJoinEndpoints.js';

export const DISCOVERY_ENDPOINT_PATH = '/companion/discovery';
export const SYNC_GROUP_JOIN_ACCEPTANCE_PATH = '/sync-group/join-acceptance';
export const SYNC_GROUP_JOIN_REQUESTS_PATH = '/sync-group/join-requests';
export const WORKSPACE_SNAPSHOT_PATH = '/companion/workspace-snapshot';
export { SYNC_DIAGNOSTICS_PATH, WORKSPACE_VERSION_PATH };
export { SYNC_IDENTITY_GLOBAL_PAGE_PATH, SYNC_IDENTITY_GLOBAL_SUMMARY_PATH
} from './companionLanIdentityGlobalGet.js';
export { SYNC_IDENTITY_FACT_SUMMARY_PATH,
  SYNC_IDENTITY_NODE_FACTS_PATH,
} from './companionLanIdentityGet.js';
export { SYNC_IDENTITY_RESTORE_SET_PATH } from './companionLanIdentityRestore.js';
export { SYNC_IDENTITY_PACK_PATH } from './companionLanIdentityPackPost.js';
export { SYNC_IDENTITY_PUSH_PATH } from './companionLanIdentityPushPost.js';
export {
  ATTACHMENT_RESOURCE_PATH,
  CONTENT_BLOB_RESOURCE_PATH,
  CONTENT_BLOB_ACK_PATH,
  SYNC_INDEX_PATH,
  SYNC_NODE_VERSIONS_PATH,
  SYNC_OBJECTS_PATH,
  SYNC_PACK_PATH,
  SYNC_PACK_FACTS_PATH,
  SYNC_REVIEW_LOG_PATH,
  SYNC_GROUP_MEMBER_STATE_PATH,
  SYNC_STATE_PATH
};

async function writeUnhandledRequestError(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  error: unknown
) {
  console.warn('[companion-sync] unhandled LAN request error', { error, url: request.url ?? null });
  appendMainProcessDiagnosticLog('companion_lan_request_failed', {
    error, requestPath: request.url?.split('?')[0] ?? null
  });
  if (response.headersSent) {
    response.destroy();
    return;
  }
  if (!response.writableEnded) {
    await runWithDatabaseConnectionOwner(() => {
      if (!response.writableEnded) writeJson(request, response, 500, { error: 'internal_server_error' });
    });
  }
}

async function handlePostRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  parsedRequestUrl: URL,
  args: {
    appVersion: string;
    onJoinRequestCreated: (() => void) | null;
    deviceId: string;
    updateGroupStatus: (status: { active_device_count: number; pending_join_request_count: number }) => void;
  }
) {
  if (parsedRequestUrl.pathname === SYNC_GROUP_JOIN_REQUESTS_PATH) {
    await handleSyncGroupJoinRequest(request, response, args.onJoinRequestCreated, writeJson);
    return true;
  }
  if (parsedRequestUrl.pathname === SYNC_GROUP_JOIN_ACCEPTANCE_PATH) {
    await handleSyncGroupJoinAcceptance(request, response, writeJson);
    return true;
  }
  if (await handleProductionCompanionFramedSyncPost({
    deviceId: args.deviceId, request, response
  })) return true;
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
    deviceId: string;
  }
) {
  if (request.method === 'GET' && isRetiredSyncJsonEndpoint(parsedRequestUrl)) {
    writeJson(request, response, 410, { error: 'sync_json_endpoint_retired' }, 'GET, OPTIONS');
    return;
  }
  if (parsedRequestUrl.pathname === ATTACHMENT_RESOURCE_PATH) {
    await handleCompanionAttachmentGet(request, response, parsedRequestUrl);
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
  if (handleWorkspaceMetadataGet(request, response, parsedRequestUrl, args)) return;
  if (parsedRequestUrl.pathname !== WORKSPACE_SNAPSHOT_PATH) {
    writeJson(request, response, 404, { error: 'not_found' });
    return;
  }
  const snapshot = loadWorkspaceSnapshot({ includeBody: true });
  writeJson(request, response, 200, buildWorkspaceSnapshotPayload(args.appVersion, args.deviceId, snapshot));
}

export function createLanWorkspaceSyncRequestHandler(args: {
  appVersion: string;
  getSyncStatus?: () => Parameters<typeof buildCompanionSyncDiagnostics>[0]['serverStatus'];
  onJoinRequestCreated: (() => void) | null;
  deviceId: string;
  updateGroupStatus: (status: { active_device_count: number; pending_join_request_count: number }) => void;
}) {
  return async (request: http.IncomingMessage, response: http.ServerResponse) => {
    try {
    const parsedRequestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'OPTIONS') {
      writeOptions(request, response);
      return;
    }
    if (request.method === 'GET' && parsedRequestUrl.pathname === DISCOVERY_ENDPOINT_PATH) {
      const discovery = await loadCompanionLanDiscovery(args.appVersion);
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
    const auth = await runWithDatabaseConnectionOwner(() => authenticateCompanionRequest({
      request, requireMemberState: true
    }));
    if (!auth.ok) {
      await runWithDatabaseConnectionOwner(() => {
        writeJson(request, response, auth.status_code, { error: auth.error });
      });
      return;
    }
    if (parsedRequestUrl.pathname === SYNC_PACK_PATH) {
      await handleSyncPackGet(request, response, parsedRequestUrl, auth.device_id, writeJson);
      return;
    }
    if (await handleCompanionSyncPackFactsGet(request, response, parsedRequestUrl, auth.device_id, writeJson)) return;
    if (await runWithDatabaseConnectionOwner(() => handleCompanionIdentityGet(
      request, response, parsedRequestUrl, auth.device_id))) return;
    await runWithDatabaseConnectionOwner(() => handleAuthenticatedGet(
      request, response, parsedRequestUrl, {
        ...args,
        authenticatedDeviceId: auth.device_id,
        getSyncStatus: args.getSyncStatus ?? (() => null)
      }
    ));
    } catch (error) {
      await writeUnhandledRequestError(request, response, error);
    }
  };
}
