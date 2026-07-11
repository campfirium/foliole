import type http from 'node:http';

import {
  CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
  evaluateSyncProtocolCompatibility,
  parseSyncProtocolDescriptor
} from '../../lib/platform/syncProtocolContract.js';

import { readCompanionRequestBody } from './companionLanRequestBody.js';
import { encryptCompanionPairingSecret, isSupportedPairingPublicKey } from './companionPairingEncryption.js';
import {
  completeCompanionPairRequest,
  countPendingCompanionPairRequests,
  createCompanionPairRequest,
  loadCompanionPairRequestForCompletion,
  reservePairCompletionSlot
} from './companionPairingRequests.js';
import { countPairedCompanionDevices, registerPairedCompanionDevice } from './companionPairingStore.js';

type PairingStatusUpdater = (pairing: {
  paired_device_count: number;
  pending_pair_request_count: number;
}) => void;

type JsonResponder = (
  request: http.IncomingMessage,
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown
) => void;
type PairCompletionState = NonNullable<ReturnType<typeof loadCompanionPairRequestForCompletion>>;

function writePairingStatus(updatePairingStatus: PairingStatusUpdater) {
  updatePairingStatus({
    paired_device_count: countPairedCompanionDevices(),
    pending_pair_request_count: countPendingCompanionPairRequests()
  });
}

async function readJsonPayload(request: http.IncomingMessage) {
  return JSON.parse(await readCompanionRequestBody(request)) as Record<string, unknown>;
}

function normalizeClientAddress(address: string | undefined) {
  if (!address) {
    return null;
  }
  return address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
}

function writePairCompletionRateLimit(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  writeJson: JsonResponder
) {
  const pairRateLimit = reservePairCompletionSlot({
    clientAddress: normalizeClientAddress(request.socket.remoteAddress)
  });
  if (pairRateLimit.allowed) {
    return false;
  }
  writeJson(request, response, 429, {
    error: 'pair_completion_rate_limited',
    retry_after_ms: pairRateLimit.retry_after_ms
  });
  return true;
}

function loadApprovedPairCompletionState(
  pairRequestId: string,
  request: http.IncomingMessage,
  response: http.ServerResponse,
  writeJson: JsonResponder
): PairCompletionState | null {
  const completionState = loadCompanionPairRequestForCompletion(pairRequestId);
  if (!completionState) {
    writeJson(request, response, 404, { error: 'pair_request_not_found' });
    return null;
  }
  if (completionState.request.status === 'pending') {
    writeJson(request, response, 409, { error: 'pair_request_pending' });
    return null;
  }
  if (completionState.request.status === 'rejected') {
    writeJson(request, response, 403, { error: 'pair_request_rejected' });
    return null;
  }
  return completionState;
}

export async function handlePairRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  appVersion: string,
  peerId: string,
  updatePairingStatus: PairingStatusUpdater,
  writeJson: JsonResponder
) {
  if (writePairCompletionRateLimit(request, response, writeJson)) return;
  const payload = await readPairCompletionPayload(request, response, writeJson);
  if (!payload) return;
  const pairRequestId = typeof payload.pair_request_id === 'string' ? payload.pair_request_id.trim() : '';
  if (!pairRequestId) {
    writeJson(request, response, 400, { error: 'invalid_pair_request' });
    return;
  }
  const completionState = loadApprovedPairCompletionState(pairRequestId, request, response, writeJson);
  if (!completionState) {
    return;
  }
  const approvedRequest = completionState.request;
  const compatibility = evaluateSyncProtocolCompatibility(approvedRequest.protocol);
  if (compatibility.status === 'incompatible') {
    writeJson(request, response, 409, {
      compatibility,
      desktop_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
      error: 'protocol_incompatible'
    });
    return;
  }
  const paired = completionState.completion ?? registerPairedCompanionDevice({
    clientAddress: approvedRequest.client_address,
    deviceId: approvedRequest.device_id,
    deviceKind: approvedRequest.device_kind,
    deviceName: approvedRequest.device_name,
    negotiatedProtocolVersion: compatibility.negotiated_version ?? CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version,
    remoteProtocol: approvedRequest.protocol
  });
  if (!completionState.completion) {
    completeCompanionPairRequest(pairRequestId, {
      device_id: paired.device_id,
      device_secret: paired.device_secret,
      paired_at: paired.paired_at
    });
  }
  const encryptedDeviceSecret = await encryptCompanionPairingSecret({
    clientPublicKey: approvedRequest.pairing_public_key,
    deviceSecret: paired.device_secret
  });
  writePairingStatus(updatePairingStatus);
  writePairCompletionResponse(request, response, writeJson, {
    app_version: appVersion,
    compatibility,
    desktop_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    device_id: paired.device_id,
    encrypted_device_secret: encryptedDeviceSecret,
    paired_at: paired.paired_at,
    peer_id: peerId
  });
}

async function readPairCompletionPayload(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  writeJson: JsonResponder
) {
  try {
    return await readJsonPayload(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_json';
    writeJson(request, response, message === 'request_too_large' ? 413 : 400, { error: message });
    return null;
  }
}

function writePairCompletionResponse(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  writeJson: JsonResponder,
  payload: Record<string, unknown>
) {
  writeJson(request, response, 200, payload);
}

export async function handlePairRequestCreate(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  updatePairingStatus: PairingStatusUpdater,
  onPairRequestCreated: (() => void) | null,
  writeJson: JsonResponder
) {
  let payload: Record<string, unknown>;
  try {
    payload = await readJsonPayload(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_json';
    writeJson(request, response, message === 'request_too_large' ? 413 : 400, { error: message });
    return;
  }
  const deviceId = typeof payload.device_id === 'string' ? payload.device_id.trim() : '';
  const deviceKind = typeof payload.device_kind === 'string' ? payload.device_kind.trim() : '';
  const deviceName = typeof payload.device_name === 'string' ? payload.device_name.trim() : '';
  const pairingPublicKey = typeof payload.pairing_public_key === 'string' ? payload.pairing_public_key.trim() : '';
  const protocol = parseSyncProtocolDescriptor(payload.protocol);
  if (!deviceId || !deviceKind || !deviceName || !isSupportedPairingPublicKey(pairingPublicKey)) {
    writeJson(request, response, 400, { error: 'invalid_pair_request' });
    return;
  }
  const compatibility = evaluateSyncProtocolCompatibility(payload.protocol);
  if (!protocol || compatibility.status === 'incompatible') {
    writeJson(request, response, 409, {
      compatibility,
      desktop_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
      error: 'protocol_incompatible'
    });
    return;
  }
  const created = createCompanionPairRequest({
    clientAddress: normalizeClientAddress(request.socket.remoteAddress),
    compatibility,
    deviceId,
    deviceKind,
    deviceName,
    pairingPublicKey,
    protocol
  });
  if (created.rate_limited) {
    writeJson(request, response, 429, {
      error: 'pair_request_rate_limited',
      retry_after_ms: created.retry_after_ms
    });
    return;
  }
  writePairingStatus(updatePairingStatus);
  onPairRequestCreated?.();
  writeJson(request, response, created.created ? 202 : 409, {
    compatibility,
    desktop_protocol: CURRENT_SYNC_PROTOCOL_DESCRIPTOR,
    expires_at: created.request.expires_at,
    pair_request_id: created.request.pair_request_id,
    status: 'pending'
  });
}
