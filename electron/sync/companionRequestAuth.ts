import type http from 'node:http';

import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { verifyCompanionRequestSignature } from './companionRequestSignature.js';
import { consumeDesktopWorkgroupNonce, loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

const AUTH_WINDOW_MS = 60 * 1000;
const NONCE_TTL_MS = 2 * 60 * 1000;
const NONCE_CACHE_LIMIT_PER_DEVICE = 2_048;
const usedNonceExpiryByDevice = new Map<string, Map<string, number>>();

interface CompanionRequestAuthSuccess {
  device_id: string;
  device_name: string;
  ok: true;
}

interface CompanionRequestAuthFailure {
  error: 'expired_timestamp' | 'invalid_signature' | 'missing_headers' |
    'replayed_nonce' | 'sync_group_device_not_active' | 'sync_group_workgroup_key_missing';
  ok: false;
  status_code: 401 | 409;
}

export type CompanionRequestAuthResult = CompanionRequestAuthFailure | CompanionRequestAuthSuccess;

export function clearCompanionRequestNonceCache() {
  usedNonceExpiryByDevice.clear();
}

export function authenticateCompanionRequest(args: {
  bodyText?: string;
  nowMs?: number;
  request: http.IncomingMessage;
}): CompanionRequestAuthResult {
  const headers = readAuthenticationHeaders(args.request);
  if (!headers.deviceId || !headers.groupId || !headers.nonce || !headers.signature || !headers.timestamp) {
    return failure('missing_headers', 401);
  }
  const device = validateActiveDevice(headers.groupId, headers.deviceId);
  if (!device) return failure('sync_group_device_not_active', 401);
  const workgroupKey = loadDesktopWorkgroupKey(headers.groupId);
  if (!workgroupKey) return failure('sync_group_workgroup_key_missing', 401);
  const nowMs = args.nowMs ?? Date.now();
  if (!isFreshTimestamp(headers.timestamp, nowMs)) return failure('expired_timestamp', 401);
  const valid = verifyCompanionRequestSignature({
    ...(args.bodyText === undefined ? {} : { bodyText: args.bodyText }),
    method: args.request.method ?? 'GET', nonce: headers.nonce,
    pathWithQuery: pathWithQuery(args.request), secret: workgroupKey.group_key,
    signature: headers.signature, timestamp: headers.timestamp
  });
  if (!valid) return failure('invalid_signature', 401);
  if (!consumeNonce(headers.deviceId, headers.nonce, nowMs)
      || !consumeDesktopWorkgroupNonce(headers.groupId, `${headers.timestamp}:${headers.nonce}`, nowMs)) {
    return failure('replayed_nonce', 409);
  }
  return { device_id: device.device_identity_key, device_name: device.device_name, ok: true };
}

function validateActiveDevice(groupId: string, deviceId: string) {
  const group = loadDesktopSyncGroup();
  return group?.group_id === groupId
    ? group.devices.find((device) => device.device_identity_key === deviceId && device.state === 'active') ?? null
    : null;
}

function readAuthenticationHeaders(request: http.IncomingMessage) {
  return {
    deviceId: readHeader(request.headers, 'x-device-id'),
    groupId: readHeader(request.headers, 'x-sync-group-id'),
    nonce: readHeader(request.headers, 'x-nonce'),
    signature: readHeader(request.headers, 'x-signature'),
    timestamp: readHeader(request.headers, 'x-timestamp')
  };
}

function consumeNonce(deviceId: string, nonce: string, nowMs: number) {
  const cache = usedNonceExpiryByDevice.get(deviceId) ?? new Map<string, number>();
  for (const [key, expiresAt] of cache) if (expiresAt <= nowMs) cache.delete(key);
  if (cache.has(nonce)) return false;
  cache.set(nonce, nowMs + NONCE_TTL_MS);
  while (cache.size > NONCE_CACHE_LIMIT_PER_DEVICE) cache.delete(cache.keys().next().value!);
  usedNonceExpiryByDevice.set(deviceId, cache);
  return true;
}

function isFreshTimestamp(timestamp: string, nowMs: number) {
  const timestampMs = Date.parse(timestamp);
  return Number.isFinite(timestampMs) && Math.abs(nowMs - timestampMs) <= AUTH_WINDOW_MS;
}

function pathWithQuery(request: http.IncomingMessage) {
  const parsed = new URL(request.url ?? '/', 'http://127.0.0.1');
  return `${parsed.pathname}${parsed.search}`;
}

function readHeader(headers: http.IncomingHttpHeaders, key: string) {
  const value = headers[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function failure(error: CompanionRequestAuthFailure['error'], status_code: 401 | 409) {
  return { error, ok: false as const, status_code };
}
