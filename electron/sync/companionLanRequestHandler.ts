import type http from 'node:http';

import type { WorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import {
  consumeApprovedCompanionPairRequest,
  countPendingCompanionPairRequests,
  createCompanionPairRequest
} from './companionPairingRequests.js';
import { countPairedCompanionDevices, registerPairedCompanionDevice } from './companionPairingStore.js';
import { authenticateCompanionRequest } from './companionRequestAuth.js';

const MAX_PAIR_REQUEST_BYTES = 16 * 1024;
const ALLOWED_CORS_ORIGINS = new Set(['capacitor://localhost', 'http://localhost']);

export const DISCOVERY_ENDPOINT_PATH = '/companion/discovery';
export const PAIR_ENDPOINT_PATH = '/companion/pair';
export const PAIR_REQUESTS_ENDPOINT_PATH = '/companion/pair-requests';
export const WORKSPACE_VERSION_PATH = '/companion/workspace-version';
export const WORKSPACE_SNAPSHOT_PATH = '/companion/workspace-snapshot';

function resolveCorsOrigin(request: http.IncomingMessage) {
  const origin = request.headers.origin;
  return typeof origin === 'string' && ALLOWED_CORS_ORIGINS.has(origin) ? origin : null;
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

function buildWorkspaceSnapshotPayload(appVersion: string, peerId: string, snapshot: WorkspaceSnapshot | null) {
  return {
    app_version: appVersion,
    desktop_name: 'Foliole Desktop',
    exported_at: new Date().toISOString(),
    peer_id: peerId,
    workspace_version: new Date().toISOString(),
    workspace_snapshot: snapshot
  };
}

function buildWorkspaceVersionPayload(appVersion: string, peerId: string, snapshot: WorkspaceSnapshot | null) {
  return {
    app_version: appVersion,
    desktop_name: 'Foliole Desktop',
    exported_at: new Date().toISOString(),
    has_snapshot: snapshot !== null,
    peer_id: peerId
  };
}

function buildDiscoveryPayload(appVersion: string, peerId: string) {
  return {
    app_version: appVersion,
    desktop_name: 'Foliole Desktop',
    pairing_mode: 'desktop-confirm' as const,
    peer_id: peerId
  };
}

async function readRequestBody(request: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bufferChunk.length;
    if (totalBytes > MAX_PAIR_REQUEST_BYTES) {
      throw new Error('request_too_large');
    }
    chunks.push(bufferChunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handlePairRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  appVersion: string,
  peerId: string,
  updatePairingStatus: (pairing: { paired_device_count: number; pending_pair_request_count: number }) => void
) {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(await readRequestBody(request)) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_json';
    writeJson(request, response, message === 'request_too_large' ? 413 : 400, { error: message });
    return;
  }
  const pairRequestId = typeof payload.pair_request_id === 'string' ? payload.pair_request_id.trim() : '';
  if (!pairRequestId) {
    writeJson(request, response, 400, { error: 'invalid_pair_request' });
    return;
  }
  const approvedRequest = consumeApprovedCompanionPairRequest(pairRequestId);
  if (!approvedRequest) {
    writeJson(request, response, 404, { error: 'pair_request_not_found' });
    return;
  }
  if (approvedRequest.status === 'pending') {
    writeJson(request, response, 409, { error: 'pair_request_pending' });
    return;
  }
  if (approvedRequest.status === 'rejected') {
    writeJson(request, response, 409, { error: 'pair_request_rejected' });
    return;
  }
  const paired = registerPairedCompanionDevice({
    deviceId: approvedRequest.device_id,
    deviceKind: approvedRequest.device_kind,
    deviceName: approvedRequest.device_name
  });
  updatePairingStatus({
    paired_device_count: countPairedCompanionDevices(),
    pending_pair_request_count: countPendingCompanionPairRequests()
  });
  writeJson(request, response, 200, {
    app_version: appVersion,
    device_id: paired.device_id,
    device_secret: paired.device_secret,
    paired_at: paired.paired_at,
    peer_id: peerId
  });
}

async function handlePairRequestCreate(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  updatePairingStatus: (pairing: { paired_device_count: number; pending_pair_request_count: number }) => void
) {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(await readRequestBody(request)) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_json';
    writeJson(request, response, message === 'request_too_large' ? 413 : 400, { error: message });
    return;
  }
  const deviceId = typeof payload.device_id === 'string' ? payload.device_id.trim() : '';
  const deviceKind = typeof payload.device_kind === 'string' ? payload.device_kind.trim() : '';
  const deviceName = typeof payload.device_name === 'string' ? payload.device_name.trim() : '';
  if (!deviceId || !deviceKind || !deviceName) {
    writeJson(request, response, 400, { error: 'invalid_pair_request' });
    return;
  }
  const created = createCompanionPairRequest({ deviceId, deviceKind, deviceName });
  const statusCode = created.created ? 202 : 409;
  updatePairingStatus({
    paired_device_count: countPairedCompanionDevices(),
    pending_pair_request_count: countPendingCompanionPairRequests()
  });
  writeJson(request, response, statusCode, {
    expires_at: created.request.expires_at,
    pair_request_id: created.request.pair_request_id,
    status: 'pending'
  });
}

export function createLanWorkspaceSyncRequestHandler(args: {
  appVersion: string;
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
    if (request.method === 'POST' && parsedRequestUrl.pathname === PAIR_REQUESTS_ENDPOINT_PATH) {
      await handlePairRequestCreate(request, response, args.updatePairingStatus);
      return;
    }
    if (request.method === 'POST' && parsedRequestUrl.pathname === PAIR_ENDPOINT_PATH) {
      await handlePairRequest(request, response, args.appVersion, args.peerId, args.updatePairingStatus);
      return;
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
    const snapshot = loadWorkspaceSnapshot();
    if (parsedRequestUrl.pathname === WORKSPACE_VERSION_PATH) {
      writeJson(request, response, 200, buildWorkspaceVersionPayload(args.appVersion, args.peerId, snapshot));
      return;
    }
    if (parsedRequestUrl.pathname !== WORKSPACE_SNAPSHOT_PATH) {
      writeJson(request, response, 404, { error: 'not_found' });
      return;
    }
    writeJson(request, response, 200, buildWorkspaceSnapshotPayload(args.appVersion, args.peerId, snapshot));
  };
}
