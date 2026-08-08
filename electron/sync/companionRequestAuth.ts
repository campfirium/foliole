import type http from 'node:http';

import { loadDesktopSyncGroup, loadSyncGroupMemberAuthorization } from '../database/syncGroupStore.js';

import { loadPairedCompanionDevice } from './companionPairingStore.js';
import { verifyCompanionRequestSignature } from './companionRequestSignature.js';

const AUTH_WINDOW_MS = 60 * 1000;
const NONCE_TTL_MS = 2 * 60 * 1000;
const NONCE_CACHE_LIMIT_PER_DEVICE = 2_048;

const usedNonceExpiryByDeviceId = new Map<string, Map<string, number>>();

interface CompanionRequestAuthSuccess {
  device_id: string;
  member_state?: 'active' | 'provisioning';
  ok: true;
}

interface CompanionRequestAuthFailure {
  error:
    | 'expired_timestamp'
    | 'invalid_signature'
    | 'missing_headers'
    | 'sync_group_member_not_authorized'
    | 'protocol_pairing_repair_required'
    | 'replayed_nonce'
    | 'unknown_device';
  ok: false;
  status_code: 401 | 409;
}

export type CompanionRequestAuthResult = CompanionRequestAuthFailure | CompanionRequestAuthSuccess;

function parsePathWithQuery(request: http.IncomingMessage) {
  const parsed = new URL(request.url ?? '/', 'http://127.0.0.1');
  return `${parsed.pathname}${parsed.search}`;
}

function pruneDeviceUsedNonces(deviceCache: Map<string, number>, nowMs: number) {
  for (const [key, expiresAtMs] of deviceCache.entries()) {
    if (expiresAtMs <= nowMs) {
      deviceCache.delete(key);
    }
  }
  while (deviceCache.size > NONCE_CACHE_LIMIT_PER_DEVICE) {
    const oldest = deviceCache.keys().next();
    if (oldest.done) {
      return;
    }
    deviceCache.delete(oldest.value);
  }
}

function consumeNonce(deviceId: string, nonce: string, nowMs: number) {
  const deviceCache = usedNonceExpiryByDeviceId.get(deviceId) ?? new Map<string, number>();
  pruneDeviceUsedNonces(deviceCache, nowMs);
  if (deviceCache.has(nonce)) {
    return false;
  }
  deviceCache.set(nonce, nowMs + NONCE_TTL_MS);
  pruneDeviceUsedNonces(deviceCache, nowMs);
  if (deviceCache.size === 0) {
    usedNonceExpiryByDeviceId.delete(deviceId);
  } else {
    usedNonceExpiryByDeviceId.set(deviceId, deviceCache);
  }
  return true;
}

function readHeader(headers: http.IncomingHttpHeaders, key: string) {
  const value = headers[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function clearCompanionRequestNonceCache() {
  usedNonceExpiryByDeviceId.clear();
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
  const deviceId = readHeader(args.request.headers, 'x-device-id');
  const nonce = readHeader(args.request.headers, 'x-nonce');
  const signature = readHeader(args.request.headers, 'x-signature');
  const timestamp = readHeader(args.request.headers, 'x-timestamp');
  const groupId = readHeader(args.request.headers, 'x-sync-group-id');
  if (!deviceId || !nonce || !signature || !timestamp) {
    return {
      error: 'missing_headers',
      ok: false,
      status_code: 401
    };
  }
  const pairedDevice = loadPairedCompanionDevice(deviceId);
  const pairedDeviceError = validatePairedDevice(pairedDevice);
  if (pairedDeviceError) return pairedDeviceError;
  const authenticatedDevice = pairedDevice!;
  const groupMembership = validateSyncGroupMembership(authenticatedDevice.device_kind, groupId, deviceId);
  if (!groupMembership.ok) return groupMembership;
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
    secret: authenticatedDevice.device_secret,
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
  if (!consumeNonce(deviceId, nonce, nowMs)) {
    return {
      error: 'replayed_nonce',
      ok: false,
      status_code: 409
    };
  }
  return {
    device_id: deviceId,
    ...(groupMembership.member_state ? { member_state: groupMembership.member_state } : {}),
    ok: true
  };
}

function validateSyncGroupMembership(deviceKind: string, groupId: string | null, deviceId: string) {
  if (deviceKind !== 'android-capacitor' && !groupId) return { member_state: null, ok: true as const };
  const group = loadDesktopSyncGroup();
  const membership = groupId && group?.group_id === groupId
    ? loadSyncGroupMemberAuthorization(groupId, deviceId)
    : null;
  if (!membership) {
    return { error: 'sync_group_member_not_authorized' as const, ok: false as const, status_code: 401 as const };
  }
  return { member_state: membership.state, ok: true as const };
}

function validatePairedDevice(pairedDevice: ReturnType<typeof loadPairedCompanionDevice>) {
  if (!pairedDevice) {
    return { error: 'unknown_device' as const, ok: false as const, status_code: 401 as const };
  }
  if (!pairedDevice.remote_protocol || pairedDevice.negotiated_protocol_version !== 1) {
    return {
      error: 'protocol_pairing_repair_required' as const,
      ok: false as const,
      status_code: 409 as const
    };
  }
  return null;
}
