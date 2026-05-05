import { randomUUID } from 'node:crypto';

const PAIR_REQUEST_TTL_MS = 2 * 60 * 1000;

export interface PendingCompanionPairRequest {
  device_id: string;
  device_kind: string;
  device_name: string;
  expires_at: string;
  pair_request_id: string;
  requested_at: string;
  status: 'approved' | 'pending' | 'rejected';
}

interface StoredCompanionPairRequest extends PendingCompanionPairRequest {
  expires_at_ms: number;
}

const requestsById = new Map<string, StoredCompanionPairRequest>();

function pruneExpiredRequests(nowMs: number) {
  for (const [requestId, request] of requestsById.entries()) {
    if (request.expires_at_ms <= nowMs) {
      requestsById.delete(requestId);
    }
  }
}

function toPublicRequest(request: StoredCompanionPairRequest): PendingCompanionPairRequest {
  return {
    device_id: request.device_id,
    device_kind: request.device_kind,
    device_name: request.device_name,
    expires_at: request.expires_at,
    pair_request_id: request.pair_request_id,
    requested_at: request.requested_at,
    status: request.status
  };
}

export function createCompanionPairRequest(args: {
  deviceId: string;
  deviceKind: string;
  deviceName: string;
  nowMs?: number;
}) {
  const nowMs = args.nowMs ?? Date.now();
  pruneExpiredRequests(nowMs);
  const existingPendingRequest = [...requestsById.values()].find((request) => {
    return request.device_id === args.deviceId.trim() && request.status === 'pending';
  });
  if (existingPendingRequest) {
    return {
      created: false,
      request: toPublicRequest(existingPendingRequest)
    } as const;
  }
  const expiresAtMs = nowMs + PAIR_REQUEST_TTL_MS;
  const request: StoredCompanionPairRequest = {
    device_id: args.deviceId.trim(),
    device_kind: args.deviceKind.trim(),
    device_name: args.deviceName.trim(),
    expires_at: new Date(expiresAtMs).toISOString(),
    expires_at_ms: expiresAtMs,
    pair_request_id: randomUUID(),
    requested_at: new Date(nowMs).toISOString(),
    status: 'pending'
  };
  requestsById.set(request.pair_request_id, request);
  return {
    created: true,
    request: toPublicRequest(request)
  } as const;
}

export function loadPendingCompanionPairRequests(nowMs = Date.now()) {
  pruneExpiredRequests(nowMs);
  return [...requestsById.values()]
    .filter((request) => request.status === 'pending')
    .map(toPublicRequest);
}

export function countPendingCompanionPairRequests(nowMs = Date.now()) {
  return loadPendingCompanionPairRequests(nowMs).length;
}

function updateRequestStatus(pairRequestId: string, status: PendingCompanionPairRequest['status'], nowMs = Date.now()) {
  pruneExpiredRequests(nowMs);
  const request = requestsById.get(pairRequestId);
  if (!request) {
    return null;
  }
  request.status = status;
  return toPublicRequest(request);
}

export function approveCompanionPairRequest(pairRequestId: string, nowMs = Date.now()) {
  return updateRequestStatus(pairRequestId, 'approved', nowMs);
}

export function rejectCompanionPairRequest(pairRequestId: string, nowMs = Date.now()) {
  return updateRequestStatus(pairRequestId, 'rejected', nowMs);
}

export function consumeApprovedCompanionPairRequest(pairRequestId: string, nowMs = Date.now()) {
  pruneExpiredRequests(nowMs);
  const request = requestsById.get(pairRequestId);
  if (!request) {
    return null;
  }
  if (request.status !== 'approved') {
    return toPublicRequest(request);
  }
  requestsById.delete(pairRequestId);
  return toPublicRequest(request);
}

export function clearCompanionPairRequests() {
  requestsById.clear();
}
