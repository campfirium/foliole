import type http from 'node:http';

import { readCompanionRequestBody } from './companionLanRequestBody.js';
import {
  consumeApprovedCompanionPairRequest,
  countPendingCompanionPairRequests,
  createCompanionPairRequest
} from './companionPairingRequests.js';
import { countPairedCompanionDevices, registerPairedCompanionDevice, removePairedCompanionDevice } from './companionPairingStore.js';

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

export async function handlePairRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  appVersion: string,
  peerId: string,
  updatePairingStatus: PairingStatusUpdater,
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
  writePairingStatus(updatePairingStatus);
  writeJson(request, response, 200, {
    app_version: appVersion,
    device_id: paired.device_id,
    device_secret: paired.device_secret,
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
  writePairingStatus(updatePairingStatus);
  onPairRequestCreated?.();
  writeJson(request, response, created.created ? 202 : 409, {
    expires_at: created.request.expires_at,
    pair_request_id: created.request.pair_request_id,
    status: 'pending'
  });
}
