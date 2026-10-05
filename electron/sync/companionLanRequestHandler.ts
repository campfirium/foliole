import type http from 'node:http';

import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';

import type { buildCompanionSyncDiagnostics } from './buildCompanionSyncDiagnostics.js';
import { handleAuthenticatedPost } from './companionLanAuthenticatedPost.js';
import { loadCompanionLanDiscovery } from './companionLanDiscovery.js';
import { handleProductionCompanionFramedSyncPost } from './companionLanFramedSyncRoute.js';
import {
  buildWorkspaceSnapshotPayload,
} from './companionLanPayloads.js';
import { writeJson, writeOptions } from './companionLanResponses.js';
import {
  isRetiredSyncJsonEndpoint,
  SYNC_INDEX_PATH,
  SYNC_NODE_VERSIONS_PATH,
  SYNC_OBJECTS_PATH,
  SYNC_REVIEW_LOG_PATH,
  SYNC_STATE_PATH
} from './companionLanSyncObjects.js';
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
export const ATTACHMENT_RESOURCE_PATH = '/companion/attachment-resource';
export const SYNC_GROUP_JOIN_ACCEPTANCE_PATH = '/sync-group/join-acceptance';
export const SYNC_GROUP_JOIN_REQUESTS_PATH = '/sync-group/join-requests';
export const WORKSPACE_SNAPSHOT_PATH = '/companion/workspace-snapshot';
export { SYNC_DIAGNOSTICS_PATH, WORKSPACE_VERSION_PATH };
export {
  SYNC_INDEX_PATH,
  SYNC_NODE_VERSIONS_PATH,
  SYNC_OBJECTS_PATH,
  SYNC_REVIEW_LOG_PATH,
  SYNC_GROUP_MEMBER_STATE_PATH,
  SYNC_STATE_PATH
};

const RETIRED_GET_PATHS = new Set([
  '/companion/attachment-resource',
  '/companion/content-blob',
  '/companion/sync-identity-changed-page',
  '/companion/sync-identity-fact-global-page',
  '/companion/sync-identity-fact-page',
  '/companion/sync-identity-fact-summary',
  '/companion/sync-identity-global-page',
  '/companion/sync-identity-global-summary',
  '/companion/sync-identity-node-facts',
  '/companion/sync-identity-page',
  '/companion/sync-identity-restore-set',
  '/companion/sync-identity-summary',
  '/companion/sync-pack',
  '/companion/sync-pack-facts'
]);

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
  if (request.method === 'GET' &&
      (isRetiredSyncJsonEndpoint(parsedRequestUrl) || RETIRED_GET_PATHS.has(parsedRequestUrl.pathname))) {
    writeJson(request, response, 410, { error: 'framed_sync_required' }, 'GET, OPTIONS');
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
