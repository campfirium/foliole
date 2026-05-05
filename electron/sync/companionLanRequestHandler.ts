import type http from 'node:http';

import { loadWorkspaceSnapshot, loadWorkspaceVersionMetadata } from '../database/workspaceSnapshot.js';

import {
  ATTACHMENT_RESOURCE_PATH,
  loadCompanionAttachmentResource
} from './companionLanAttachmentResources.js';
import { handlePairRequest, handlePairRequestCreate } from './companionLanPairingEndpoints.js';
import {
  buildDiscoveryPayload,
  buildWorkspaceSnapshotPayload,
  buildWorkspaceVersionPayload
} from './companionLanPayloads.js';
import {
  handleSyncNodeVersionsPush,
  handleSyncObjectsPush,
  handleSyncReviewLogPush
} from './companionLanSyncObjectPush.js';
import {
  buildSyncIndexPayload,
  buildSyncNodeVersionsPayload,
  buildSyncObjectsPayload,
  buildSyncReviewLogPayload,
  buildSyncStatePayload,
  isSyncObjectEndpoint,
  SYNC_INDEX_PATH,
  SYNC_NODE_VERSIONS_PATH,
  SYNC_OBJECTS_PATH,
  SYNC_REVIEW_LOG_PATH,
  SYNC_STATE_PATH
} from './companionLanSyncObjects.js';
import { authenticateCompanionRequest } from './companionRequestAuth.js';

const ALLOWED_CORS_PROTOCOLS = new Set(['capacitor:', 'http:', 'https:']);

export const DISCOVERY_ENDPOINT_PATH = '/companion/discovery';
export const PAIR_ENDPOINT_PATH = '/companion/pair';
export const PAIR_REQUESTS_ENDPOINT_PATH = '/companion/pair-requests';
export const WORKSPACE_VERSION_PATH = '/companion/workspace-version';
export const WORKSPACE_SNAPSHOT_PATH = '/companion/workspace-snapshot';
export {
  ATTACHMENT_RESOURCE_PATH,
  SYNC_INDEX_PATH,
  SYNC_NODE_VERSIONS_PATH,
  SYNC_OBJECTS_PATH,
  SYNC_REVIEW_LOG_PATH,
  SYNC_STATE_PATH
};

function resolveCorsOrigin(request: http.IncomingMessage) {
  const origin = request.headers.origin;
  if (typeof origin !== 'string' || !origin.trim()) {
    return null;
  }
  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.hostname === 'localhost' && ALLOWED_CORS_PROTOCOLS.has(parsedOrigin.protocol)) {
      return origin;
    }
  } catch {
    return null;
  }
  return null;
}

function writeJson(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown,
  methods = 'GET, OPTIONS, POST'
) {
  const allowedOrigin = resolveCorsOrigin(request);
  response.writeHead(statusCode, {
    'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id, X-Nonce, X-Signature, X-Timestamp',
    'Access-Control-Allow-Methods': methods,
    ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin, Vary: 'Origin' } : {}),
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(payload));
}

function writeOptions(request: http.IncomingMessage, response: http.ServerResponse) {
  response.writeHead(204, {
    'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id, X-Nonce, X-Signature, X-Timestamp',
    'Access-Control-Allow-Methods': 'GET, OPTIONS, POST',
    ...(resolveCorsOrigin(request)
      ? {
          'Access-Control-Allow-Origin': resolveCorsOrigin(request) ?? '',
          Vary: 'Origin'
        }
      : {})
  });
  response.end();
}

function writeBinary(response: http.ServerResponse, statusCode: number, body: Buffer, mimeType: string | null) {
  response.writeHead(statusCode, {
    'Content-Length': body.byteLength,
    'Content-Type': mimeType ?? 'application/octet-stream'
  });
  response.end(body);
}

function buildSyncEndpointPayload(parsedRequestUrl: URL) {
  if (parsedRequestUrl.pathname === SYNC_INDEX_PATH) {
    return buildSyncIndexPayload();
  }
  if (parsedRequestUrl.pathname === SYNC_STATE_PATH) {
    return buildSyncStatePayload(parsedRequestUrl);
  }
  if (parsedRequestUrl.pathname === SYNC_NODE_VERSIONS_PATH) {
    return buildSyncNodeVersionsPayload(parsedRequestUrl);
  }
  if (parsedRequestUrl.pathname === SYNC_REVIEW_LOG_PATH) {
    return buildSyncReviewLogPayload(parsedRequestUrl);
  }
  return buildSyncObjectsPayload(parsedRequestUrl);
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
  if (parsedRequestUrl.pathname === SYNC_OBJECTS_PATH) {
    await handleSyncObjectsPush(request, response, writeJson);
    return true;
  }
  if (parsedRequestUrl.pathname === SYNC_NODE_VERSIONS_PATH) {
    await handleSyncNodeVersionsPush(request, response, writeJson);
    return true;
  }
  if (parsedRequestUrl.pathname === SYNC_REVIEW_LOG_PATH) {
    await handleSyncReviewLogPush(request, response, writeJson);
    return true;
  }
  return false;
}

async function handleAuthenticatedGet(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  parsedRequestUrl: URL,
  args: { appVersion: string; peerId: string }
) {
  if (isSyncObjectEndpoint(request, parsedRequestUrl)) {
    writeJson(request, response, 200, buildSyncEndpointPayload(parsedRequestUrl));
    return;
  }
  if (parsedRequestUrl.pathname === ATTACHMENT_RESOURCE_PATH) {
    const resource = await loadCompanionAttachmentResource(
      parsedRequestUrl.searchParams.get('attachment_id'),
      parsedRequestUrl.searchParams.get('content_hash')
    );
    if (resource.status === 'ready') {
      writeBinary(response, 200, resource.body, resource.mimeType);
    } else {
      writeJson(request, response, resource.statusCode, { error: resource.error }, 'GET, OPTIONS');
    }
    return;
  }
  if (parsedRequestUrl.pathname === WORKSPACE_VERSION_PATH) {
    const version = loadWorkspaceVersionMetadata();
    writeJson(request, response, 200, buildWorkspaceVersionPayload(args.appVersion, args.peerId, version));
    return;
  }
  if (parsedRequestUrl.pathname !== WORKSPACE_SNAPSHOT_PATH) {
    writeJson(request, response, 404, { error: 'not_found' });
    return;
  }
  const snapshot = loadWorkspaceSnapshot();
  writeJson(request, response, 200, buildWorkspaceSnapshotPayload(args.appVersion, args.peerId, snapshot));
}

export function createLanWorkspaceSyncRequestHandler(args: {
  appVersion: string;
  onPairRequestCreated: (() => void) | null;
  peerId: string;
  updatePairingStatus: (pairing: { paired_device_count: number; pending_pair_request_count: number }) => void;
}) {
  return async (request: http.IncomingMessage, response: http.ServerResponse) => {
    const parsedRequestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method === 'OPTIONS') {
      writeOptions(request, response);
      return;
    }
    if (request.method === 'GET' && parsedRequestUrl.pathname === DISCOVERY_ENDPOINT_PATH) {
      writeJson(request, response, 200, buildDiscoveryPayload(args.appVersion, args.peerId));
      return;
    }
    if (request.method === 'POST') {
      if (await handlePostRequest(request, response, parsedRequestUrl, args)) return;
    }
    if (request.method !== 'GET') {
      writeJson(request, response, 405, { error: 'method_not_allowed' });
      return;
    }
    if (parsedRequestUrl.pathname === '/health') {
      writeJson(request, response, 200, { ok: true, peer_id: args.peerId });
      return;
    }
    const auth = authenticateCompanionRequest({ request });
    if (!auth.ok) {
      writeJson(request, response, auth.status_code, { error: auth.error });
      return;
    }
    await handleAuthenticatedGet(request, response, parsedRequestUrl, args);
  };
}
