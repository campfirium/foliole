import type http from 'node:http';
import os from 'node:os';

import type { WorkspaceSnapshot } from '../database/workspaceSnapshot.js';
import { loadWorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import {
  consumeApprovedCompanionPairRequest,
  countPendingCompanionPairRequests,
  createCompanionPairRequest
} from './companionPairingRequests.js';
import { countPairedCompanionDevices, registerPairedCompanionDevice, removePairedCompanionDevice } from './companionPairingStore.js';
import { authenticateCompanionRequest } from './companionRequestAuth.js';

const MAX_PAIR_REQUEST_BYTES = 16 * 1024;
const ALLOWED_CORS_PROTOCOLS = new Set(['capacitor:', 'http:', 'https:']);

export const DISCOVERY_ENDPOINT_PATH = '/companion/discovery';
export const PAIR_ENDPOINT_PATH = '/companion/pair';
export const PAIR_REQUESTS_ENDPOINT_PATH = '/companion/pair-requests';
export const WORKSPACE_VERSION_PATH = '/companion/workspace-version';
export const WORKSPACE_SNAPSHOT_PATH = '/companion/workspace-snapshot';

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

function resolveDesktopPlatformLabel() {
  const platform = os.platform();
  if (platform === 'win32') {
    return 'Windows';
  }
  if (platform === 'darwin') {
    return 'macOS';
  }
  if (platform === 'linux') {
    return 'Linux';
  }
  return platform;
}

function resolveDesktopDeviceName() {
  const hostName = os.hostname().trim();
  return hostName ? `Foliole Desktop on ${hostName}` : 'Foliole Desktop';
}

function buildDiscoveryPayload(appVersion: string, peerId: string) {
  const hostName = os.hostname().trim();
  return {
    app_version: appVersion,
    desktop_device_name: resolveDesktopDeviceName(),
    desktop_name: 'Foliole Desktop',
    desktop_platform: resolveDesktopPlatformLabel(),
    host_name: hostName || 'Desktop',
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
    writeJson(request, response, 403, { error: 'pair_request_rejected' });
    return;
  }
  const paired = registerPairedCompanionDevice({
    clientAddress: approvedRequest.client_address,
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


function normalizeClientAddress(address: string | undefined) {
  if (!address) {
    return null;
  }
  if (address.startsWith('::ffff:')) {
    return address.slice('::ffff:'.length);
  }
  return address;
}

async function handlePairRequestCreate(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  updatePairingStatus: (pairing: { paired_device_count: number; pending_pair_request_count: number }) => void,
  onPairRequestCreated: (() => void) | null
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
  removePairedCompanionDevice(deviceId);
  const created = createCompanionPairRequest({
    clientAddress: normalizeClientAddress(request.socket.remoteAddress),
    deviceId,
    deviceKind,
    deviceName
  });
  const statusCode = created.created ? 202 : 409;
  updatePairingStatus({
    paired_device_count: countPairedCompanionDevices(),
    pending_pair_request_count: countPendingCompanionPairRequests()
  });
  onPairRequestCreated?.();
  writeJson(request, response, statusCode, {
    expires_at: created.request.expires_at,
    pair_request_id: created.request.pair_request_id,
    status: 'pending'
  });
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
    if (request.method === 'POST' && parsedRequestUrl.pathname === PAIR_REQUESTS_ENDPOINT_PATH) {
      await handlePairRequestCreate(request, response, args.updatePairingStatus, args.onPairRequestCreated);
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
