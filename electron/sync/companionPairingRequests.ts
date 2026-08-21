import { randomUUID } from 'node:crypto';

import type { SyncProtocolCompatibilityResult, SyncProtocolDescriptor } from '../../lib/platform/syncProtocolContract.js';

import {
  type CompletedCompanionPairRequest,
  type PendingCompanionPairRequest,
  type StoredCompanionPairRequest,
  toPublicPairRequest
} from './companionPairRequestPresentation.js';

export type { CompletedCompanionPairRequest, PendingCompanionPairRequest } from './companionPairRequestPresentation.js';

const PAIR_REQUEST_TTL_MS = 2 * 60 * 1000;
const PAIR_REQUEST_RATE_LIMIT_MAX = 5;
const PAIR_REQUEST_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const PAIR_COMPLETION_RATE_LIMIT_MAX = 10;
const PAIR_COMPLETION_RATE_LIMIT_WINDOW_MS = 60 * 1000;

const requestsById = new Map<string, StoredCompanionPairRequest>();
const pairCompletionTimestampsByClient = new Map<string, number[]>();
const requestTimestampsByClient = new Map<string, number[]>();

function pruneExpiredRequests(nowMs: number) {
  for (const [requestId, request] of requestsById.entries()) {
    if (request.expires_at_ms <= nowMs) {
      requestsById.delete(requestId);
    }
  }
}

function resolveRateLimitKey(args: { clientAddress?: string | null; hostName: string }) {
  return args.clientAddress?.trim() || `host:${args.hostName.trim() || 'unknown'}`;
}

function reserveRateLimitSlot(args: { clientAddress?: string | null; hostName: string; nowMs: number }) {
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

function refreshPendingRequest(
  request: StoredCompanionPairRequest,
  args: Parameters<typeof createCompanionPairRequest>[0]
) {
  request.pairing_public_key = args.pairingPublicKey.trim();
  request.compatibility = args.compatibility;
  request.protocol = args.protocol;
  if (args.groupId) request.group_id = args.groupId;
  if (args.timelineId) request.timeline_id = args.timelineId;
  return { created: false, rate_limited: false, request: toPublicPairRequest(request) } as const;
}

function createStoredPairRequest(
  args: Parameters<typeof createCompanionPairRequest>[0],
  nowMs: number,
  expiresAtMs: number
): StoredCompanionPairRequest {
  return {
    client_address: args.clientAddress?.trim() || null,
    compatibility: args.compatibility,
    host_name: args.hostName.trim(),
    host_platform: args.hostPlatform.trim(),
    expires_at: new Date(expiresAtMs).toISOString(),
    expires_at_ms: expiresAtMs,
    completion: null,
    pairing_public_key: args.pairingPublicKey.trim(),
    protocol: args.protocol,
    pair_request_id: randomUUID(),
    requested_at: new Date(nowMs).toISOString(),
    status: 'pending',
    ...(args.groupId ? { group_id: args.groupId } : {}),
    ...(args.timelineId ? { timeline_id: args.timelineId } : {})
  };
}

export function createCompanionPairRequest(args: {
  clientAddress?: string | null;
  compatibility: SyncProtocolCompatibilityResult;
  hostName: string;
  hostPlatform: string;
  nowMs?: number;
  pairingPublicKey: string;
  protocol: SyncProtocolDescriptor;
  groupId?: string;
  timelineId?: string;
}) {
  const nowMs = args.nowMs ?? Date.now();
  pruneExpiredRequests(nowMs);
  const existingPendingRequest = [...requestsById.values()].find((request) => {
    return request.client_address === (args.clientAddress?.trim() || null)
      && request.host_name === args.hostName.trim()
      && request.status === 'pending';
  });
  if (existingPendingRequest) {
    return refreshPendingRequest(existingPendingRequest, args);
  }
  const rateLimit = reserveRateLimitSlot({
    ...(args.clientAddress === undefined ? {} : { clientAddress: args.clientAddress }),
    hostName: args.hostName,
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
  const request = createStoredPairRequest(args, nowMs, expiresAtMs);
  requestsById.set(request.pair_request_id, request);
  return {
    created: true,
    rate_limited: false,
    request: toPublicPairRequest(request)
  } as const;
}

export function loadPendingCompanionPairRequests(nowMs = Date.now()) {
  pruneExpiredRequests(nowMs);
  return [...requestsById.values()]
    .filter((request) => request.status === 'pending')
    .map(toPublicPairRequest);
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
  if (status === 'approved') {
    request.expires_at_ms = nowMs + PAIR_REQUEST_TTL_MS;
    request.expires_at = new Date(request.expires_at_ms).toISOString();
  }
  return toPublicPairRequest(request);
}

export function approveCompanionPairRequest(
  pairRequestId: string,
  nowMs = Date.now(),
  membershipAction?: PendingCompanionPairRequest['membership_action'],
  approvedHostName?: string,
  memberAuthorizationId?: string
) {
  const result = updateRequestStatus(pairRequestId, 'approved', nowMs);
  const request = requestsById.get(pairRequestId);
  if (request && membershipAction) request.membership_action = membershipAction;
  if (request && approvedHostName?.trim()) request.host_name = approvedHostName.trim();
  if (request && memberAuthorizationId?.trim()) request.member_authorization_id = memberAuthorizationId.trim();
  return result && request ? toPublicPairRequest(request) : result;
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
    return toPublicPairRequest(request);
  }
  requestsById.delete(pairRequestId);
  return toPublicPairRequest(request);
}

export function loadCompanionPairRequestForCompletion(pairRequestId: string, nowMs = Date.now()) {
  pruneExpiredRequests(nowMs);
  const request = requestsById.get(pairRequestId);
  if (!request) {
    return null;
  }
  return {
    completion: request.completion,
    request: toPublicPairRequest(request)
  };
}

export function completeCompanionPairRequest(
  pairRequestId: string,
  completion: CompletedCompanionPairRequest,
  nowMs = Date.now()
) {
  pruneExpiredRequests(nowMs);
  const request = requestsById.get(pairRequestId);
  if (!request || request.status !== 'approved') {
    return false;
  }
  request.completion = completion;
  return true;
}

export function reservePairCompletionSlot(args: { clientAddress?: string | null; nowMs?: number }) {
  const nowMs = args.nowMs ?? Date.now();
  const key = args.clientAddress?.trim() || 'unknown';
  const windowStartMs = nowMs - PAIR_COMPLETION_RATE_LIMIT_WINDOW_MS;
  const recentTimestamps = (pairCompletionTimestampsByClient.get(key) ?? []).filter((timestamp) => timestamp > windowStartMs);
  if (recentTimestamps.length >= PAIR_COMPLETION_RATE_LIMIT_MAX) {
    return {
      allowed: false,
      retry_after_ms: (recentTimestamps[0] ?? nowMs) + PAIR_COMPLETION_RATE_LIMIT_WINDOW_MS - nowMs
    } as const;
  }
  recentTimestamps.push(nowMs);
  pairCompletionTimestampsByClient.set(key, recentTimestamps);
  return { allowed: true } as const;
}

export function clearCompanionPairRequests() {
  pairCompletionTimestampsByClient.clear();
  requestsById.clear();
  requestTimestampsByClient.clear();
}
