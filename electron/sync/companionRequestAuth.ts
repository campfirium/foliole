import type http from 'node:http';

import { loadDesktopSyncGroup, loadSyncGroupMemberByAuthorization } from '../database/syncGroupStore.js';

import { verifyCompanionRequestSignature } from './companionRequestSignature.js';
import { consumeDesktopWorkgroupNonce, loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

const AUTH_WINDOW_MS = 60 * 1000;
const NONCE_TTL_MS = 2 * 60 * 1000;
const NONCE_CACHE_LIMIT_PER_AUTHORIZATION = 2_048;

const usedNonceExpiryByAuthorization = new Map<string, Map<string, number>>();

interface CompanionRequestAuthSuccess {
  authorization_id: string;
  host_name: string;
  member_state?: 'active';
  ok: true;
}

interface CompanionRequestAuthFailure {
  error:
    | 'expired_timestamp'
    | 'invalid_signature'
    | 'missing_headers'
    | 'sync_group_member_not_authorized'
    | 'replayed_nonce'
    | 'sync_group_workgroup_key_missing';
  ok: false;
  status_code: 401 | 409;
}

export type CompanionRequestAuthResult = CompanionRequestAuthFailure | CompanionRequestAuthSuccess;

function parsePathWithQuery(request: http.IncomingMessage) {
  const parsed = new URL(request.url ?? '/', 'http://127.0.0.1');
  return `${parsed.pathname}${parsed.search}`;
}

function pruneAuthorizationNonces(authorizationCache: Map<string, number>, nowMs: number) {
  for (const [key, expiresAtMs] of authorizationCache.entries()) {
    if (expiresAtMs <= nowMs) {
      authorizationCache.delete(key);
    }
  }
  while (authorizationCache.size > NONCE_CACHE_LIMIT_PER_AUTHORIZATION) {
    const oldest = authorizationCache.keys().next();
    if (oldest.done) {
      return;
    }
    authorizationCache.delete(oldest.value);
  }
}

function consumeNonce(authorizationId: string, nonce: string, nowMs: number) {
  const authorizationCache = usedNonceExpiryByAuthorization.get(authorizationId) ?? new Map<string, number>();
  pruneAuthorizationNonces(authorizationCache, nowMs);
  if (authorizationCache.has(nonce)) {
    return false;
  }
  authorizationCache.set(nonce, nowMs + NONCE_TTL_MS);
  pruneAuthorizationNonces(authorizationCache, nowMs);
  if (authorizationCache.size === 0) {
    usedNonceExpiryByAuthorization.delete(authorizationId);
  } else {
    usedNonceExpiryByAuthorization.set(authorizationId, authorizationCache);
  }
  return true;
}

function readHeader(headers: http.IncomingHttpHeaders, key: string) {
  const value = headers[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function clearCompanionRequestNonceCache() {
  usedNonceExpiryByAuthorization.clear();
}

function isFreshTimestamp(timestamp: string, nowMs: number) {
  const timestampMs = Date.parse(timestamp);
  return Number.isFinite(timestampMs) && Math.abs(nowMs - timestampMs) <= AUTH_WINDOW_MS;
}

export function authenticateCompanionRequest(args: {
  bodyText?: string;
  nowMs?: number;
  request: http.IncomingMessage;
}): CompanionRequestAuthResult {
  const authorizationId = readHeader(args.request.headers, 'x-authorization-id');
  const nonce = readHeader(args.request.headers, 'x-nonce');
  const signature = readHeader(args.request.headers, 'x-signature');
  const timestamp = readHeader(args.request.headers, 'x-timestamp');
  const groupId = readHeader(args.request.headers, 'x-sync-group-id');
  if (!authorizationId || !nonce || !signature || !timestamp) {
    return {
      error: 'missing_headers',
      ok: false,
      status_code: 401
    };
  }
  const groupMembership = validateSyncGroupMembership(groupId, authorizationId);
  if (!groupMembership.ok) return groupMembership;
  const workgroupKey = groupId ? loadDesktopWorkgroupKey(groupId) : null;
  if (!workgroupKey) return { error: 'sync_group_workgroup_key_missing', ok: false, status_code: 401 };
  const nowMs = args.nowMs ?? Date.now();
  if (!isFreshTimestamp(timestamp, nowMs)) {
    return {
      error: 'expired_timestamp',
      ok: false,
      status_code: 401
    };
  }
  const validSignature = verifyCompanionRequestSignature({
    ...(args.bodyText === undefined ? {} : { bodyText: args.bodyText }),
    method: args.request.method ?? 'GET',
    nonce,
    pathWithQuery: parsePathWithQuery(args.request),
    secret: workgroupKey.group_key,
    signature,
    timestamp
  });
  if (!validSignature) {
    return {
      error: 'invalid_signature',
      ok: false,
      status_code: 401
    };
  }
  if (!consumeNonce(authorizationId, nonce, nowMs)
    || !consumeDesktopWorkgroupNonce(groupId!, `${timestamp}:${nonce}`, nowMs)) {
    return {
      error: 'replayed_nonce',
      ok: false,
      status_code: 409
    };
  }
  return {
    authorization_id: authorizationId,
    host_name: groupMembership.host_name,
    ...(groupMembership.member_state ? { member_state: groupMembership.member_state } : {}),
    ok: true
  };
}

function validateSyncGroupMembership(groupId: string | null, authorizationId: string) {
  const group = loadDesktopSyncGroup();
  const membership = groupId && group?.group_id === groupId
    ? loadSyncGroupMemberByAuthorization(groupId, authorizationId)
    : null;
  if (!membership) {
    return { error: 'sync_group_member_not_authorized' as const, ok: false as const, status_code: 401 as const };
  }
  return { host_name: membership.host_name, member_state: membership.state, ok: true as const };
}
