import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type http from 'node:http';

import { loadPairedCompanionDevice } from './companionPairingStore.js';

const AUTH_WINDOW_MS = 60 * 1000;
const NONCE_TTL_MS = 2 * 60 * 1000;
const NONCE_CACHE_LIMIT = 2_048;

const usedNonceExpiryByKey = new Map<string, number>();

export interface CompanionRequestAuthSuccess {
  device_id: string;
  ok: true;
}

export interface CompanionRequestAuthFailure {
  error: 'expired_timestamp' | 'invalid_signature' | 'missing_headers' | 'replayed_nonce' | 'unknown_device';
  ok: false;
  status_code: 401 | 409;
}

export type CompanionRequestAuthResult = CompanionRequestAuthFailure | CompanionRequestAuthSuccess;

function sha256Hex(bodyText: string) {
  return createHash('sha256').update(bodyText).digest('hex');
}

function buildCanonicalRequestPayload(args: {
  bodyHash: string;
  method: string;
  nonce: string;
  pathWithQuery: string;
  timestamp: string;
}) {
  return [args.method.toUpperCase(), args.pathWithQuery, args.timestamp, args.nonce, args.bodyHash].join('\n');
}

function parsePathWithQuery(request: http.IncomingMessage) {
  const parsed = new URL(request.url ?? '/', 'http://127.0.0.1');
  return `${parsed.pathname}${parsed.search}`;
}

function pruneUsedNonces(nowMs: number) {
  for (const [key, expiresAtMs] of usedNonceExpiryByKey.entries()) {
    if (expiresAtMs <= nowMs) {
      usedNonceExpiryByKey.delete(key);
    }
  }
  while (usedNonceExpiryByKey.size > NONCE_CACHE_LIMIT) {
    const oldest = usedNonceExpiryByKey.keys().next();
    if (oldest.done) {
      return;
    }
    usedNonceExpiryByKey.delete(oldest.value);
  }
}

function consumeNonce(deviceId: string, nonce: string, nowMs: number) {
  pruneUsedNonces(nowMs);
  const nonceKey = `${deviceId}:${nonce}`;
  if (usedNonceExpiryByKey.has(nonceKey)) {
    return false;
  }
  usedNonceExpiryByKey.set(nonceKey, nowMs + NONCE_TTL_MS);
  return true;
}

function readHeader(headers: http.IncomingHttpHeaders, key: string) {
  const value = headers[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function compareSignatures(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function clearCompanionRequestNonceCache() {
  usedNonceExpiryByKey.clear();
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
  if (!deviceId || !nonce || !signature || !timestamp) {
    return {
      error: 'missing_headers',
      ok: false,
      status_code: 401
    };
  }
  const pairedDevice = loadPairedCompanionDevice(deviceId);
  if (!pairedDevice) {
    return {
      error: 'unknown_device',
      ok: false,
      status_code: 401
    };
  }
  const nowMs = args.nowMs ?? Date.now();
  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(nowMs - timestampMs) > AUTH_WINDOW_MS) {
    return {
      error: 'expired_timestamp',
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
  const canonicalPayload = buildCanonicalRequestPayload({
    bodyHash: sha256Hex(args.bodyText ?? ''),
    method: args.request.method ?? 'GET',
    nonce,
    pathWithQuery: parsePathWithQuery(args.request),
    timestamp
  });
  const expectedSignature = createHmac('sha256', pairedDevice.device_secret).update(canonicalPayload).digest('hex');
  if (!compareSignatures(signature, expectedSignature)) {
    return {
      error: 'invalid_signature',
      ok: false,
      status_code: 401
    };
  }
  return {
    device_id: deviceId,
    ok: true
  };
}
