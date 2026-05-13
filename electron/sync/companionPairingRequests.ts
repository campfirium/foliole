import { randomUUID } from 'node:crypto';

const PAIR_REQUEST_TTL_MS = 2 * 60 * 1000;
const PAIR_REQUEST_RATE_LIMIT_MAX = 5;
const PAIR_REQUEST_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export interface PendingCompanionPairRequest {
  client_address: string | null;
  device_id: string;
  device_kind: string;
  device_name: string;
  expires_at: string;
  pairing_public_key: string;
  pair_request_id: string;
  requested_at: string;
  status: 'approved' | 'pending' | 'rejected';
}

interface StoredCompanionPairRequest extends PendingCompanionPairRequest {
  expires_at_ms: number;
}

const requestsById = new Map<string, StoredCompanionPairRequest>();
const requestTimestampsByClient = new Map<string, number[]>();

function pruneExpiredRequests(nowMs: number) {
  for (const [requestId, request] of requestsById.entries()) {
    if (request.expires_at_ms <= nowMs) {
      requestsById.delete(requestId);
    }
  }
}

function resolveRateLimitKey(args: { clientAddress?: string | null; deviceId: string }) {
  return args.clientAddress?.trim() || `device:${args.deviceId.trim() || 'unknown'}`;
}

function reserveRateLimitSlot(args: { clientAddress?: string | null; deviceId: string; nowMs: number }) {
  const key = resolveRateLimitKey(args);
  const windowStartMs = args.nowMs - PAIR_REQUEST_RATE_LIMIT_WINDOW_MS;
  const recentTimestamps = (requestTimestampsByClient.get(key) ?? []).filter((timestamp) => timestamp > windowStartMs);
  if (recentTimestamps.length >= PAIR_REQUEST_RATE_LIMIT_MAX) {
    return {
      allowed: false,
      retry_after_ms: (recentTimestamps[0] ?? args.nowMs) + PAIR_REQUEST_RATE_LIMIT_WINDOW_MS - args.nowMs
    } as const;
  }
  recentTimestamps.push(args.nowMs);
  requestTimestampsByClient.set(key, recentTimestamps);
  return { allowed: true } as const;
}

function toPublicRequest(request: StoredCompanionPairRequest): PendingCompanionPairRequest {
  return {
    client_address: request.client_address,
    device_id: request.device_id,
    device_kind: request.device_kind,
    device_name: request.device_name,
    expires_at: request.expires_at,
    pairing_public_key: request.pairing_public_key,
    pair_request_id: request.pair_request_id,
    requested_at: request.requested_at,
    status: request.status
  };
}

export function createCompanionPairRequest(args: {
  clientAddress?: string | null;
  deviceId: string;
  deviceKind: string;
  deviceName: string;
  nowMs?: number;
  pairingPublicKey: string;
}) {
  const nowMs = args.nowMs ?? Date.now();
  pruneExpiredRequests(nowMs);
  const existingPendingRequest = [...requestsById.values()].find((request) => {
    return request.device_id === args.deviceId.trim() && request.status === 'pending';
  });
  if (existingPendingRequest) {
    existingPendingRequest.pairing_public_key = args.pairingPublicKey.trim();
    return {
      created: false,
      rate_limited: false,
      request: toPublicRequest(existingPendingRequest)
    } as const;
  }
  const rateLimit = reserveRateLimitSlot({
    ...(args.clientAddress === undefined ? {} : { clientAddress: args.clientAddress }),
    deviceId: args.deviceId,
    nowMs
  });
  if (!rateLimit.allowed) {
    return {
      created: false,
      rate_limited: true,
      retry_after_ms: rateLimit.retry_after_ms
    } as const;
  }
  const expiresAtMs = nowMs + PAIR_REQUEST_TTL_MS;
  const request: StoredCompanionPairRequest = {
    client_address: args.clientAddress?.trim() || null,
    device_id: args.deviceId.trim(),
    device_kind: args.deviceKind.trim(),
    device_name: args.deviceName.trim(),
    expires_at: new Date(expiresAtMs).toISOString(),
    expires_at_ms: expiresAtMs,
    pairing_public_key: args.pairingPublicKey.trim(),
    pair_request_id: randomUUID(),
    requested_at: new Date(nowMs).toISOString(),
    status: 'pending'
  };
  requestsById.set(request.pair_request_id, request);
  return {
    created: true,
    rate_limited: false,
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
  requestTimestampsByClient.clear();
}
