import type http from 'node:http';

import { readCompanionRequestBody } from './companionLanRequestBody.js';
import { encryptCompanionPairingSecret, isSupportedPairingPublicKey } from './companionPairingEncryption.js';
import {
  consumeApprovedCompanionPairRequest,
  countPendingCompanionPairRequests,
  createCompanionPairRequest,
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

export async function handlePairRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  appVersion: string,
  peerId: string,
  updatePairingStatus: PairingStatusUpdater,
  writeJson: JsonResponder
) {
  if (writePairCompletionRateLimit(request, response, writeJson)) return;
  let payload: Record<string, unknown>;
  try {
    payload = await readJsonPayload(request);
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
  const encryptedDeviceSecret = await encryptCompanionPairingSecret({
    clientPublicKey: approvedRequest.pairing_public_key,
    deviceSecret: paired.device_secret
  });
  writePairingStatus(updatePairingStatus);
  writeJson(request, response, 200, {
    app_version: appVersion,
    device_id: paired.device_id,
    encrypted_device_secret: encryptedDeviceSecret,
    paired_at: paired.paired_at,
    peer_id: peerId
  });
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
  if (!deviceId || !deviceKind || !deviceName || !isSupportedPairingPublicKey(pairingPublicKey)) {
    writeJson(request, response, 400, { error: 'invalid_pair_request' });
    return;
  }
  const created = createCompanionPairRequest({
    clientAddress: normalizeClientAddress(request.socket.remoteAddress),
    deviceId,
    deviceKind,
    deviceName,
    pairingPublicKey
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
    expires_at: created.request.expires_at,
    pair_request_id: created.request.pair_request_id,
    status: 'pending'
  });
}
